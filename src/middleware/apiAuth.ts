import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { userModel } from '../database';
import { redisClient } from '../database/redis';
import { HTTP_STATUS } from '../common';
import { reqInfo, apiResponse } from '../helper';

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
        const cacheKey = `apiKey:${publicKey}`;
        let user: any;

        // Try to get user from Redis cache
        const cachedUser = await redisClient.get(cacheKey);
        if (cachedUser) {
            user = JSON.parse(cachedUser.toString());
        } else {
            // Cache Miss: Query MongoDB
            user = await userModel.findOne({ apiKey: publicKey, isActive: true, isDeleted: false }).lean();
            if (!user) {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json(new apiResponse(HTTP_STATUS.UNAUTHORIZED, "Secret key missing for user", {}, {}));
            }
            // Save to Redis cache for 10 minutes
            await redisClient.setEx(cacheKey, 600, JSON.stringify(user));
        }

        // Verify HMAC-SHA256 signature
        const payload = (req as any).rawBody;
        const expectedSignature = crypto.createHmac('sha256', user.secretKey || '').update(payload).digest('hex');

        if (signature !== expectedSignature) {
            return res.status(HTTP_STATUS.UNAUTHORIZED).json(new apiResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid Signature", {
                received: signature,
                expected: expectedSignature
            }, {}));
        }
        (req as any).user = user;
        next();
    } catch (error: any) {
        console.error('API Auth Error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, "Internal server error", {}, error));
    }
};
