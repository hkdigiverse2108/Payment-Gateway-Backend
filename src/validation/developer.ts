import Joi from 'joi';

export const updateMerchantConfigSchema = Joi.object({
    websiteName: Joi.string().optional().allow(''),
    websiteUrl: Joi.string().optional().allow('').uri(),
    payinCallbackUrl: Joi.string().optional().allow('').uri(),
    payoutCallbackUrl: Joi.string().optional().allow('').uri()
});

export const testWebhookSchema = Joi.object({
    type: Joi.string().required().valid('payin', 'payout'),
    url: Joi.string().required().uri()
});
