
import mongoose, { Schema, Document } from 'mongoose';

export interface ICategoryAlias extends Document {
  alias: string; // The specific expense category (e.g., "Cervezas")
  mainCategories: string[]; // The broader categories it belongs to (e.g., ["Alcohol", "Ocio", "Bares"])
}

const CategoryAliasSchema: Schema = new Schema({
  alias: { type: String, required: true, unique: true, trim: true },
  mainCategories: [{ type: String, required: true, trim: true }]
});

export default mongoose.model<ICategoryAlias>('CategoryAlias', CategoryAliasSchema);
