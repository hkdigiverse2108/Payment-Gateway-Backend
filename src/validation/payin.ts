import Joi from 'joi';

export const createDepositSchema = Joi.object({
    amount: Joi.number().required().min(1),
    orderId: Joi.string().required(),
    customerPhone: Joi.string().required(),
    customerName: Joi.string().optional().allow(''),
    customerEmail: Joi.string().optional().email().allow(''),
    returnUrl: Joi.string().optional().allow('').uri(),
    notifyUrl: Joi.string().optional().allow('').uri(),
    metadata: Joi.object().optional()
});

export const getTransactionStatusSchema = Joi.object({
    orderId: Joi.string().required()
});
