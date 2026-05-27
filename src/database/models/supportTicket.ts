import mongoose, { Schema, Document } from 'mongoose';
import { TICKET_STATUS, TICKET_CATEGORY, TICKET_PRIORITY } from '../../common';

export interface ISupportTicket {
    userId: mongoose.Types.ObjectId;
    ticketId: string;
    transactionId?: mongoose.Types.ObjectId;
    orderId?: string;
    category: string;
    subject: string;
    status: string;
    priority: string;
    assignedTo?: mongoose.Types.ObjectId;
    botResolved: boolean;
    botAttempts: number;
    escalatedAt?: Date;
    resolvedAt?: Date;
    closedAt?: Date;
    resolution?: string;
    metadata?: any;
    isDeleted: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface ISupportTicketDocument extends ISupportTicket, Document { }

const supportTicketSchema = new Schema<ISupportTicketDocument>({
    userId: { type: Schema.Types.ObjectId, ref: 'user', required: true, index: true },
    ticketId: { type: String, required: true, unique: true, index: true },
    transactionId: { type: Schema.Types.ObjectId, ref: 'transaction', default: null },
    orderId: { type: String, default: null, index: true },
    category: { type: String, enum: Object.values(TICKET_CATEGORY), default: TICKET_CATEGORY.OTHER },
    subject: { type: String, required: true },
    status: { type: String, enum: Object.values(TICKET_STATUS), default: TICKET_STATUS.OPEN, index: true },
    priority: { type: String, enum: Object.values(TICKET_PRIORITY), default: TICKET_PRIORITY.MEDIUM },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'user', default: null },
    botResolved: { type: Boolean, default: false },
    botAttempts: { type: Number, default: 0 },
    escalatedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    resolution: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

// Compound indexes for common query patterns
supportTicketSchema.index({ userId: 1, status: 1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ assignedTo: 1, status: 1 });

export const supportTicketModel = mongoose.model<ISupportTicketDocument>('supportTicket', supportTicketSchema);
