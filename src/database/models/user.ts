import mongoose, { Schema, Document } from 'mongoose';
import { USER_ROLE } from '../../common';

export interface IUser {
    userName: string;
    name?: string;
    email?: string;
    mobileNumber?: number;
    password: string;
    apiKey?: string;
    secretKey?: string;
    websiteName?: string;
    websiteUrl?: string;
    payinCallbackUrl?: string;
    payoutCallbackUrl?: string;
    role: 'admin' | 'user';
    walletBalance: number;
    isActive: boolean;
    isDeleted: boolean;
}

export interface IUserDocument extends IUser, Document { }

const userSchema = new Schema<IUserDocument>({
    userName: { type: String },
    name: { type: String },
    email: { type: String },
    mobileNumber: { type: Number },
    password: { type: String },
    apiKey: { type: String },
    secretKey: { type: String },
    websiteName: { type: String },
    websiteUrl: { type: String },
    payinCallbackUrl: { type: String },
    payoutCallbackUrl: { type: String },
    role: { type: String, enum: Object.values(USER_ROLE), default: USER_ROLE.USER },
    walletBalance: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

export const userModel = mongoose.model<IUserDocument>('user', userSchema);