import mongoose, { Schema, Document } from 'mongoose';

export interface IUserPreferences extends Document {
    userId: mongoose.Types.ObjectId;
    filters: {
        category?: string[];
        description?: string;
        dateFrom?: string;
        dateTo?: string;
        payer?: string;
        period?: string;
        localization?: string;
    };
    quickExpense?: {
        lastIcon?: string;
        prices?: Map<string, number>;
    };
    // Orden de los grupos en la pantalla de inicio (propio de cada usuario)
    groupOrder?: mongoose.Types.ObjectId[];
}

const UserPreferencesSchema: Schema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    filters: {
        category: { type: [String] },
        description: { type: String },
        dateFrom: { type: String },
        dateTo: { type: String },
        payer: { type: String },
        period: { type: String },
        localization: { type: String },
    },
    quickExpense: {
        lastIcon: { type: String },
        prices: { type: Map, of: Number }
    },
    groupOrder: [{ type: Schema.Types.ObjectId, ref: 'Group' }]
});

export default mongoose.model<IUserPreferences>('UserPreferences', UserPreferencesSchema);
