import Joi from 'joi';

export const createTicketSchema = Joi.object({
    category: Joi.string().valid('payment_failed', 'payment_pending', 'refund', 'withdrawal', 'account', 'other').optional().default('other'),
    orderId: Joi.string().optional().allow(''),
    subject: Joi.string().optional().allow('').max(200),
    message: Joi.string().optional().allow('').max(2000),
});

export const sendMessageSchema = Joi.object({
    ticketId: Joi.string().required(),
    content: Joi.string().required().max(2000),
});

export const getTicketsSchema = Joi.object({
    page: Joi.number().optional(),
    limit: Joi.number().optional(),
    search: Joi.string().optional().allow(''),
    status: Joi.string().optional().allow(''),
    category: Joi.string().optional().allow(''),
    priority: Joi.string().optional().allow(''),
    startDateFilter: Joi.string().optional().allow(''),
    endDateFilter: Joi.string().optional().allow(''),
    sortFilter: Joi.string().optional().allow(''),
});

export const updateTicketSchema = Joi.object({
    ticketId: Joi.string().required(),
    status: Joi.string().valid('open', 'bot_handling', 'escalated', 'resolved', 'closed').optional(),
    resolution: Joi.string().optional().allow('').max(2000),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
    assignedTo: Joi.string().optional().allow(''),
});

export const closeTicketSchema = Joi.object({
    ticketId: Joi.string().required(),
    resolution: Joi.string().optional().allow('').max(2000),
});

export const escalateTicketSchema = Joi.object({
    ticketId: Joi.string().required(),
    reason: Joi.string().optional().allow('').max(2000),
});

export const adminReplySchema = Joi.object({
    ticketId: Joi.string().required(),
    content: Joi.string().required().max(2000),
});

export const markReadSchema = Joi.object({
    ticketId: Joi.string().required(),
});

export const getTicketByIdSchema = Joi.object({
    ticketId: Joi.string().required(),
});

export const getChatHistorySchema = Joi.object({
    ticketId: Joi.string().required(),
    page: Joi.number().optional(),
    limit: Joi.number().optional().default(50),
});

export const acceptTicketSchema = Joi.object({
    ticketId: Joi.string().required(),
});
