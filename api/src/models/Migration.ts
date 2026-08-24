import mongoose, { Schema, Document } from 'mongoose';

export interface IMigration extends Document {
  name: string;
  appliedAt: Date;
}

const MigrationSchema: Schema = new Schema({
  name: { type: String, required: true, unique: true },
  appliedAt: { type: Date, default: Date.now }
});

export default mongoose.model<IMigration>('Migration', MigrationSchema);
