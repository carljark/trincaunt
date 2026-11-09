import mongoose, { Schema, Document } from 'mongoose';

// Aplicación registrada por OAuth (registro dinámico, RFC 7591): p. ej. el conector de Claude.
// Es un cliente público: no tiene secreto y usa PKCE.
export interface IOAuthClient extends Document {
  clientId: string;
  nombre: string;
  redirectUris: string[];
  createdAt: Date;
}

const OAuthClientSchema: Schema = new Schema({
  clientId: { type: String, required: true, unique: true },
  nombre: { type: String, required: true, trim: true },
  redirectUris: { type: [String], required: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model<IOAuthClient>('OAuthClient', OAuthClientSchema);
