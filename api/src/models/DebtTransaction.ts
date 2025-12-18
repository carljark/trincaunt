import mongoose, { Document, Schema } from 'mongoose';
import { IUser } from './User'; // Assuming IUser exists for User model

interface IDebtTransactionBase {
  group: mongoose.Schema.Types.ObjectId;
  amount: number; // Stored in cents to avoid floating point issues, or directly in currency unit
  paid: boolean;
  createdAt: Date;
}

export interface IDebtTransaction extends IDebtTransactionBase, Document {
  from: mongoose.Schema.Types.ObjectId;
  to: mongoose.Schema.Types.ObjectId;
}

// Interface for a DebtTransaction with populated 'from' and 'to' fields
export interface PopulatedDebtTransaction extends IDebtTransactionBase {
  from: IUser; // Assuming IUser is the interface for the User model
  to: IUser;   // Assuming IUser is the interface for the User model
}

const DebtTransactionSchema: Schema = new Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  amount: { type: Number, required: true },
  paid: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Add a compound index to quickly query outstanding debts for a group
DebtTransactionSchema.index({ group: 1, paid: 1 });

export default mongoose.model<IDebtTransaction>('DebtTransaction', DebtTransactionSchema);
