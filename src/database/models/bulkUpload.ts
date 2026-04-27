import mongoose, { Schema, Document } from 'mongoose';
import { BULK_UPLOAD_STATUS } from '../../common';

export interface IBulkUpload {
    userId: mongoose.Types.ObjectId;
    fileName: string;
    totalRows: number;
    processedRows: number;
    successCount: number;
    failedCount: number;
    pendingCount: number;
    status: string;
}

export interface IBulkUploadDocument extends IBulkUpload, Document { }

const bulkUploadSchema = new Schema<IBulkUploadDocument>({
    userId: { type: Schema.Types.ObjectId, ref: 'user', required: true },
    fileName: { type: String, required: true },
    totalRows: { type: Number, default: 0 },
    processedRows: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    pendingCount: { type: Number, default: 0 },
    status: { type: String, enum: Object.values(BULK_UPLOAD_STATUS), default: BULK_UPLOAD_STATUS.PENDING }
}, { timestamps: true });

export const bulkUploadModel = mongoose.model<IBulkUploadDocument>('bulkUpload', bulkUploadSchema);
