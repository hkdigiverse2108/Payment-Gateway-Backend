import Joi from 'joi';
import { isValidObjectId } from '../common';

export const addUserSchema = Joi.object({
    userName: Joi.string().required(),
    name: Joi.string().required(),
    email: Joi.string().required(),
    mobileNumber: Joi.number().required(),
    password: Joi.string().required(),
    websiteName: Joi.string().required(),
    websiteUrl: Joi.string().required(),
    payinCallbackUrl: Joi.string().required(),
    payoutCallbackUrl: Joi.string().required(),
    isActive: Joi.boolean().optional()
});

export const editUserSchema = Joi.object({
    userId: Joi.string().custom(isValidObjectId).required(),
    userName: Joi.string().required(),
    name: Joi.string().required(),
    email: Joi.string().required(),
    mobileNumber: Joi.number().required(),
    password: Joi.string().required(),
    websiteName: Joi.string().required(),
    websiteUrl: Joi.string().required(),
    payinCallbackUrl: Joi.string().required(),
    payoutCallbackUrl: Joi.string().required(),
    isActive: Joi.boolean().optional()
});

export const deleteUserSchema = Joi.object({
    id: Joi.string().custom(isValidObjectId).required()
});

export const getUsersSchema = Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
    search: Joi.string().optional(),
    sortFilter: Joi.string().optional(),
    activeFilter: Joi.string().optional(),
    startDateFilter: Joi.string().optional(),
    endDateFilter: Joi.string().optional(),
});

export const getUserByIdSchema = Joi.object({
    id: Joi.string().custom(isValidObjectId).required()
});
