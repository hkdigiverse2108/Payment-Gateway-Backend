import Joi from 'joi';

export const getTransactionsSchema = Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
    search: Joi.string().optional().allow(''),
    type: Joi.string().optional().allow(''),
    status: Joi.string().optional().allow(''),
    paymentStatus: Joi.string().optional().allow(''),
    startDateFilter: Joi.string().optional().allow(''),
    endDateFilter: Joi.string().optional().allow(''),
    sortFilter: Joi.string().optional().allow('')
});

export const exportTransactionsSchema = Joi.object({
    search: Joi.string().optional().allow(''),
    type: Joi.string().optional().allow(''),
    status: Joi.string().optional().allow(''),
    paymentStatus: Joi.string().optional().allow(''),
    startDateFilter: Joi.string().optional().allow(''),
    endDateFilter: Joi.string().optional().allow('')
});
