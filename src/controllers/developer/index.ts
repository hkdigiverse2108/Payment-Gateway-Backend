import { HTTP_STATUS, createUserService } from '../../common';
import { userModel } from '../../database';
import { reqInfo, responseMessage, getFirstMatch, updateData, redisGet, redisSet,redisDelPattern, apiResponse } from '../../helper';
import { updateMerchantConfigSchema, testWebhookSchema } from '../../validation';
import crypto from 'crypto';

export const getMerchantConfig = async (req, res) => {
    reqInfo(req);
    try {
        const cacheKey = `developer:merchantConfig:${req.user._id.toString()}`;
        const cachedConfig = await redisGet(cacheKey);
        if (cachedConfig) { return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Config fetched", cachedConfig, {})); }

        const user = await getFirstMatch(userModel, { _id: req.user._id }, {
            apiKey: 1,
            secretKey: 1,
            websiteName: 1,
            websiteUrl: 1,
            payinCallbackUrl: 1,
            payoutCallbackUrl: 1
        });

        if (user) { await redisSet(cacheKey, user, 300); }
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Config fetched", user, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const updateMerchantConfig = async (req, res) => {
    reqInfo(req);
    try {
        const { error, value } = updateMerchantConfigSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const { websiteName, websiteUrl, payinCallbackUrl, payoutCallbackUrl } = value;
        const user = await updateData(userModel, { _id: req.user._id }, {
            websiteName,
            websiteUrl,
            payinCallbackUrl,
            payoutCallbackUrl 
        });

        const cacheKey = `developer:merchantConfig:${req.user._id.toString()}`;
        await redisDelPattern(cacheKey);
        if (user) { await redisSet(cacheKey, user, 300); }
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Config updated successfully", user, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const regenerateApiKeys = async (req, res) => {
    reqInfo(req);
    try {
        const { apiKey, secretKey } = await createUserService();
        const user = await updateData(userModel, { _id: req.user._id }, { apiKey, secretKey });

        const cacheKey = `developer:merchantConfig:${req.user._id.toString()}`;
        const secretCacheKey = `developer:userSecret:${req.user._id.toString()}`;
        await redisDelPattern(cacheKey);
        await redisDelPattern(secretCacheKey);
        if (user) { await redisSet(cacheKey, user, 300); }
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "API Keys regenerated successfully", { apiKey, secretKey }, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const testWebhook = async (req, res) => {
    reqInfo(req);
    try {
        const { error, value } = testWebhookSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const { type, url } = value;
        const payload = {
            event: "test_webhook",
            timestamp: Date.now(),
            message: "This is a test webhook from Gateway Bridge"
        };

        const cacheKey = `developer:userSecret:${req.user._id.toString()}`;
        let user = await redisGet<{ secretKey: string }>(cacheKey);
        if (!user) {
            user = await getFirstMatch(userModel, { _id: req.user._id }, { secretKey: 1 });
            if (user) { await redisSet(cacheKey, user, 300); }
        }

        const signature = crypto
            .createHmac('sha256', user?.secretKey || '')
            .update(JSON.stringify(payload))
            .digest('hex');

        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Webhook test simulation", {
            url,
            payload,
            headers: { 'x-signature': signature }
        }, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};