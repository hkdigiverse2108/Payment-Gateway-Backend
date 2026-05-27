import mongoose, { Schema, Document } from 'mongoose';
import { SENDER_TYPE, MESSAGE_TYPE } from '../../common';

export interface IChatMessage {
    ticketId: mongoose.Types.ObjectId;
    senderId?: mongoose.Types.ObjectId;
    senderType: string;
    messageType: string;
    content: string;
    metadata?: any;
    isRead: boolean;
    isDeleted: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface IChatMessageDocument extends IChatMessage, Document { }

const chatMessageSchema = new Schema<IChatMessageDocument>({
    ticketId: { type: Schema.Types.ObjectId, ref: 'supportTicket', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'user', default: null },
    senderType: { type: String, enum: Object.values(SENDER_TYPE), required: true },
    messageType: { type: String, enum: Object.values(MESSAGE_TYPE), default: MESSAGE_TYPE.TEXT },
    content: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

// Index for fast chat history retrieval
chatMessageSchema.index({ ticketId: 1, createdAt: 1 });
chatMessageSchema.index({ ticketId: 1, isRead: 1 });

export const chatMessageModel = mongoose.model<IChatMessageDocument>('chatMessage', chatMessageSchema);
