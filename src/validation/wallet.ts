import Joi from 'joi';

export const getWalletActivitySchema = Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
    search: Joi.string().optional().allow(''),
    startDateFilter: Joi.string().optional().allow(''),
    endDateFilter: Joi.string().optional().allow(''),
    sortFilter: Joi.string().optional().allow('')
});
