import Joi from 'joi';

export const manualWithdrawSchema = Joi.object({
    amount: Joi.number().required().min(1),
    bankName: Joi.string().required(),
    accountNumber: Joi.string().required(),
    ifscCode: Joi.string().required(),
    accountHolderName: Joi.string().required(),
    branch: Joi.string().optional().allow('')
});

export const quickPasteWithdrawSchema = Joi.object({
    pasteData: Joi.string().required()
});
