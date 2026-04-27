import mongoose, { Schema, Document } from 'mongoose';
import { WALLET_ACTIVITY_TYPE } from '../../common';

export interface IWalletActivity {
    userId: mongoose.Types.ObjectId;
    transactionId?: mongoose.Types.ObjectId;
    type: string; // credit, debit
    amount: number;
    previousBalance: number;
    newBalance: number;
    description?: string;
    brand?: string;
}

export interface IWalletActivityDocument extends IWalletActivity, Document { }

const walletActivitySchema = new Schema<IWalletActivityDocument>({
    userId: { type: Schema.Types.ObjectId, ref: 'user', required: true },
    transactionId: { type: Schema.Types.ObjectId, ref: 'transaction' },
    type: { type: String, enum: Object.values(WALLET_ACTIVITY_TYPE), required: true },
    amount: { type: Number, required: true },
    previousBalance: { type: Number, required: true },
    newBalance: { type: Number, required: true },
    description: { type: String },
    brand: { type: String }
}, { timestamps: true });

export const walletActivityModel = mongoose.model<IWalletActivityDocument>('walletActivity', walletActivitySchema);
