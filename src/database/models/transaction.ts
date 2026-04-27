import mongoose, { Schema, Document } from 'mongoose';
import { ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS, TRANSACTION_TYPE } from '../../common';

export interface ITransaction {
    userId: mongoose.Types.ObjectId;
    orderId: string;
    traId: string;
    type: string; // deposit, withdraw
    amount: number;
    status: string; // pending, success, failed, etc.
    paymentStatus: string; // approved, processing, etc.
    accountDetails?: {
        bankName?: string;
        accountNumber?: string;
        ifscCode?: string;
        accountHolderName?: string;
        branch?: string;
    };
    utr?: string;
    brand?: string;
    remarks?: string;
    rejectionReason?: string;
    isSandbox?: boolean;
    metadata?: any;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface ITransactionDocument extends ITransaction, Document { }

const transactionSchema = new Schema<ITransactionDocument>({
    userId: { type: Schema.Types.ObjectId, ref: 'user', required: true },
    orderId: { type: String, required: true, unique: true },
    traId: { type: String, required: true, unique: true },
    type: { type: String, enum: Object.values(TRANSACTION_TYPE), required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: Object.values(ORDER_STATUS), default: ORDER_STATUS.PENDING },
    paymentStatus: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
    accountDetails: {
        bankName: { type: String },
        accountNumber: { type: String },
        ifscCode: { type: String },
        accountHolderName: { type: String },
        branch: { type: String }
    },
    utr: { type: String },
    brand: { type: String },
    remarks: { type: String },
    rejectionReason: { type: String },
    isSandbox: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed }
}, { timestamps: true });

export const transactionModel = mongoose.model<ITransactionDocument>('transaction', transactionSchema);
