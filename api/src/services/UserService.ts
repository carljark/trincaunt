import User, { IUser } from '../models/User';
import { AppError } from '../utils/AppError';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { sendMail } from '../utils/mailer';

export const MIN_PASSWORD = 8;
const RESET_TTL_MS = 60 * 60 * 1000;
const INVALID_RESET_LINK = 'El enlace no es válido o ha caducado';

const hashResetToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// URL pública de la app para los enlaces de los correos
const appUrl = () =>
  process.env.APP_URL ?? (process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173');

export class UserService {
  async register(data: Partial<IUser>): Promise<IUser> {
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      throw new AppError('El email ya está registrado', 400);
    }
    
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    
    const user = await User.create(data);
    return user;
  }
  
  async login(email: string, password: string):Promise<{ token: string; user: IUser }> {
    const user = await User.findOne({ email }).select('+password');
    if (!user || !user.password) {
      throw new AppError('Credenciales incorrectas', 401);
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AppError('Credenciales incorrectas', 401);
    }
    
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      throw new AppError('JWT_SECRET no está definido en las variables de entorno', 500);
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET!);
    
    user.password = undefined as any;
    return { token, user };
  }

  /** Cambia la contraseña comprobando la actual. */
  async changePassword(userId: string, actual: unknown, nueva: unknown): Promise<void> {
    if (typeof actual !== 'string' || !actual) throw new AppError('Escribe tu contraseña actual', 400);
    if (typeof nueva !== 'string' || nueva.length < MIN_PASSWORD) {
      throw new AppError(`La contraseña nueva debe tener al menos ${MIN_PASSWORD} caracteres`, 400);
    }
    const user = await User.findById(userId).select('+password');
    if (!user || !user.password) throw new AppError('Usuario no encontrado', 404);
    if (!(await bcrypt.compare(actual, user.password))) throw new AppError('La contraseña actual no es correcta', 400);
    user.password = await bcrypt.hash(nueva, 10);
    await user.save();
  }

  /**
   * Envía un enlace para elegir una contraseña nueva (de un solo uso, caduca en una hora).
   * No dice si el email existe: quien llama responde igual en todos los casos.
   */
  async requestPasswordReset(email: string): Promise<void> {
    // Los emails se guardaron tal como se escribieron al registrarse: se buscan sin distinguir mayúsculas
    const user = await User.findOne({ email: new RegExp(`^${escapeRegExp(email.trim())}$`, 'i') });
    if (!user) return;
    const baseUrl = appUrl();
    if (!baseUrl) {
      console.log('reset mail not sent: APP_URL is not set');
      return;
    }
    const token = crypto.randomBytes(32).toString('hex');
    await User.updateOne(
      { _id: user._id },
      { $set: { resetTokenHash: hashResetToken(token), resetExpires: new Date(Date.now() + RESET_TTL_MS) } }
    );
    const link = `${baseUrl}/reset-password?token=${token}`;
    await sendMail(
      user.email,
      'Recupera tu contraseña de Trincaunt',
      `Hola ${user.nombre}:\n\nPara elegir una contraseña nueva, abre este enlace (caduca en una hora):\n\n${link}\n\nSi no lo has pedido tú, ignora este correo.`
    );
  }

  /** Cambia la contraseña con el token del enlace del correo, que deja de valer. */
  async resetPassword(token: unknown, password: unknown): Promise<void> {
    if (typeof token !== 'string' || !token) throw new AppError(INVALID_RESET_LINK, 400);
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
      throw new AppError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`, 400);
    }
    const user = await User.findOne({ resetTokenHash: hashResetToken(token), resetExpires: { $gt: new Date() } });
    if (!user) throw new AppError(INVALID_RESET_LINK, 400);
    await User.updateOne(
      { _id: user._id },
      { $set: { password: await bcrypt.hash(password, 10) }, $unset: { resetTokenHash: '', resetExpires: '' } }
    );
  }

  async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email });
  }
}