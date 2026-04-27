import Joi from 'joi';
import { isValidObjectId } from '../common';

export const loginSchema = Joi.object({
    userName: Joi.string().required(),
    password: Joi.string().required()
});

export const changePasswordSchema = Joi.object({
    userId: Joi.string().custom(isValidObjectId).required(),
    oldPassword: Joi.string().required(),
    newPassword: Joi.string().required(),
    confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required().messages({
        "any.only": "New password and confirm new password does not match",
    })
});