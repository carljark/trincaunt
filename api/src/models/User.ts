import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  nombre: string;
  email: string;
  password?: string;
  fecha_registro: Date;
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
  fecha_registro: { type: Date, default: Date.now }
});

export default mongoose.model<IUser>('User', UserSchema);