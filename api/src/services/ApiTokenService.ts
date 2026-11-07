import crypto from 'crypto';
import mongoose from 'mongoose';
import ApiToken from '../models/ApiToken';
import User, { IUser } from '../models/User';
import { AppError } from '../utils/AppError';

export const TOKEN_PREFIX = 'trc_';
export const MAX_TOKENS_POR_USUARIO = 20;
const MAX_NOMBRE = 60;
// No se escribe el último uso en cada petición: basta con saberlo con esta precisión
const ULTIMO_USO_PRECISION_MS = 60 * 60 * 1000;

const hashOf = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const isApiToken = (token: string) => token.startsWith(TOKEN_PREFIX);

export interface ApiTokenView {
  _id: string;
  nombre: string;
  prefijo: string;
  admin: boolean;
  ultimoUso: Date | null;
  createdAt: Date;
}

const view = (doc: { _id: unknown; nombre: string; prefijo: string; admin?: boolean; ultimoUso?: Date; createdAt: Date }): ApiTokenView => ({
  _id: String(doc._id),
  nombre: doc.nombre,
  prefijo: doc.prefijo,
  admin: doc.admin === true,
  ultimoUso: doc.ultimoUso ?? null,
  createdAt: doc.createdAt
});

export class ApiTokenService {
  async list(userId: string): Promise<ApiTokenView[]> {
    const docs = await ApiToken.find({ usuario: userId }).sort({ createdAt: -1 }).lean();
    return docs.map(view);
  }

  /**
   * Crea un token y lo devuelve completo: es la única vez que se puede ver.
   * `admin` solo lo puede pedir un administrador; sin él, el token no administra aunque el usuario sea admin.
   */
  async create(user: { id: unknown; role?: IUser['role'] }, nombre: unknown, admin: unknown = false): Promise<{ token: string; apiToken: ApiTokenView }> {
    const userId = String(user.id);
    if (typeof nombre !== 'string' || !nombre.trim()) throw new AppError('Ponle un nombre al token', 400);
    if (typeof admin !== 'boolean') throw new AppError('admin debe ser verdadero o falso', 400);
    if (admin && user.role !== 'admin') throw new AppError('Solo un administrador puede crear tokens de administración', 403);
    if (nombre.trim().length > MAX_NOMBRE) throw new AppError(`El nombre admite hasta ${MAX_NOMBRE} caracteres`, 400);
    if (await ApiToken.countDocuments({ usuario: userId }) >= MAX_TOKENS_POR_USUARIO) {
      throw new AppError(`Como mucho puedes tener ${MAX_TOKENS_POR_USUARIO} tokens. Borra alguno que no uses.`, 400);
    }
    const token = TOKEN_PREFIX + crypto.randomBytes(32).toString('base64url');
    const doc = await ApiToken.create({
      usuario: userId,
      nombre: nombre.trim(),
      hash: hashOf(token),
      prefijo: token.slice(0, TOKEN_PREFIX.length + 6),
      admin
    });
    return { token, apiToken: view(doc) };
  }

  async revoke(userId: string, tokenId: string): Promise<void> {
    if (!mongoose.isValidObjectId(tokenId)) throw new AppError('Token no válido', 400);
    const result = await ApiToken.deleteOne({ _id: tokenId, usuario: userId });
    if (result.deletedCount === 0) throw new AppError('Token no encontrado', 404);
  }

  /** Usuario dueño del token, o null si no existe (o se borró). */
  async authenticate(token: string, now = new Date()): Promise<{ user: IUser; tokenId: string; admin: boolean } | null> {
    const doc = await ApiToken.findOne({ hash: hashOf(token) });
    if (!doc) return null;
    const user = await User.findById(doc.usuario);
    if (!user) return null;
    if (!doc.ultimoUso || now.getTime() - doc.ultimoUso.getTime() > ULTIMO_USO_PRECISION_MS) {
      ApiToken.updateOne({ _id: doc._id }, { $set: { ultimoUso: now } }).catch(() => {
        // No impide la petición
      });
    }
    return { user, tokenId: String(doc._id), admin: doc.admin === true };
  }
}

export default new ApiTokenService();
