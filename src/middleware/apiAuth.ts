import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { userModel } from '../database';
import { apiResponse, HTTP_STATUS } from '../common';
import { reqInfo } from '../helper';

export const apiAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    reqInfo(req);
    const publicKey = req.headers['x-api-key'] as string;
    const signature = req.headers['x-signature'] as string;

    if (!publicKey) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(new apiResponse(HTTP_STATUS.UNAUTHORIZED, "API Key is required", {}, {}));
    }

    if (!signature) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(new apiResponse(HTTP_STATUS.UNAUTHORIZED, "Signature is required", {}, {}));
    }

    try {
        const user = await userModel.findOne({ apiKey: publicKey, isActive: true, isDeleted: false });
        if (!user) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json(new apiResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API Key", {}, {}));
        }

        // Verify HMAC-SHA256 signature
        const payload = JSON.stringify(req.body);
        const expectedSignature = crypto
            .createHmac('sha256', user.secretKey || '')
            .update(payload)
            .digest('hex');

        if (signature !== expectedSignature) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json(new apiResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid Signature", {}, {}));
        }

        (req as any).user = user;
        next();
    } catch (error: any) {
        console.error('API Auth Error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, "Internal server error", {}, error));
    }
};
