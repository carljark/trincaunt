import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  nombre: string;
  email: string;
  password?: string;
  fecha_registro: Date;
  role: 'user' | 'admin';
  aiEnabled: boolean;
  // Recuperar la contraseña: solo el SHA-256 del token del enlace y su caducidad
  resetTokenHash?: string;
  resetExpires?: Date;
}

const UserSchema: Schema = new Schema({
  nombre: { type: String, required: true, minlength: 2 },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    match: [/^\S+@\S+\.\S+$/, 'Email inválido'] 
  },
  password: { type: String, required: true },
  fecha_registro: { type: Date, default: Date.now },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  aiEnabled: { type: Boolean, default: false },
  resetTokenHash: { type: String, select: false },
  resetExpires: { type: Date, select: false }
});

export default mongoose.model<IUser>('User', UserSchema);