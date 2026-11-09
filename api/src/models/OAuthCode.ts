import mongoose, { Schema, Document } from 'mongoose';

// Código de autorización OAuth: de un solo uso, caduca a los pocos minutos. Solo se guarda su hash.
export interface IOAuthCode extends Document {
  hash: string;
  clientId: string;
  usuario: mongoose.Types.ObjectId;
  redirectUri: string;
  codeChallenge: string; // PKCE S256
  expiresAt: Date;
}

const OAuthCodeSchema: Schema = new Schema({
  hash: { type: String, required: true, unique: true },
  clientId: { type: String, required: true },
  usuario: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  redirectUri: { type: String, required: true },
  codeChallenge: { type: String, required: true },
  // MongoDB borra los caducados
  expiresAt: { type: Date, required: true, index: { expires: 0 } }
});

export default mongoose.model<IOAuthCode>('OAuthCode', OAuthCodeSchema);
