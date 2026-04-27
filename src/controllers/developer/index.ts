import { userModel } from '../../database';
import { apiResponse, HTTP_STATUS, createUserService } from '../../common';
import { reqInfo, responseMessage, getFirstMatch, updateData } from '../../helper';
import crypto from 'crypto';
import { updateMerchantConfigSchema, testWebhookSchema } from '../../validation';

export const getMerchantConfig = async (req, res) => {
    reqInfo(req);
    try {
        const user = await getFirstMatch(userModel, { _id: req.user._id }, {
            apiKey: 1,
            secretKey: 1,
            websiteName: 1,
            websiteUrl: 1,
            payinCallbackUrl: 1,
            payoutCallbackUrl: 1
        });
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

        const user = await getFirstMatch(userModel, { _id: req.user._id }, { secretKey: 1 });
        const signature = crypto
            .createHmac('sha256', user?.secretKey || '')
            .update(JSON.stringify(payload))
            .digest('hex');

        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Webhook test simulation", {
            url,
            payload,
            headers: {
                'x-signature': signature
            }
        }, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};
