
import mongoose, { Schema, Document } from 'mongoose';

export interface ICategoryAlias extends Document {
  alias: string; // The specific expense category (e.g., "Cervezas")
  mainCategories: string[]; // The broader categories it belongs to (e.g., ["Alcohol", "Ocio", "Bares"])
  grupo_id?: mongoose.Types.ObjectId; // Optional for global (though we are moving to group-specific)
}

const CategoryAliasSchema: Schema = new Schema({
  alias: { type: String, required: true, trim: true },
  mainCategories: [{ type: String, required: true, trim: true }],
  grupo_id: { type: Schema.Types.ObjectId, ref: 'Group', required: false }
});

// Compound unique index for alias per group
CategoryAliasSchema.index({ alias: 1, grupo_id: 1 }, { unique: true });

export default mongoose.model<ICategoryAlias>('CategoryAlias', CategoryAliasSchema);
