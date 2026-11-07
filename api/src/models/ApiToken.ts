import mongoose, { Schema, Document } from 'mongoose';

// Token personal para usar la API desde fuera de la app (p. ej. el servidor MCP).
// Solo se guarda el hash: el token completo se enseña una vez, al crearlo.
export interface IApiToken extends Document {
  usuario: mongoose.Types.ObjectId;
  nombre: string;
  hash: string;    // sha256 del token
  prefijo: string; // primeros caracteres, para reconocerlo en la lista
  admin: boolean;  // permite las operaciones de administración (solo si el usuario es administrador)
  ultimoUso?: Date;
  createdAt: Date;
}

const ApiTokenSchema: Schema = new Schema({
  usuario: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  nombre: { type: String, required: true, trim: true },
  hash: { type: String, required: true, unique: true },
  prefijo: { type: String, required: true },
  admin: { type: Boolean, default: false },
  ultimoUso: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IApiToken>('ApiToken', ApiTokenSchema);
