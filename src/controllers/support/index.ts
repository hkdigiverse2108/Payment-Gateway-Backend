import { supportTicketModel, chatMessageModel, userModel } from '../../database';
import { HTTP_STATUS, TICKET_STATUS, TICKET_CATEGORY, SENDER_TYPE, MESSAGE_TYPE, USER_ROLE, TICKET_PRIORITY, resolveSortAndFilter } from '../../common';
import { reqInfo, responseMessage, getDataWithSorting, countData, createData, getFirstMatch, updateData, redisGet, redisSet, redisDelPattern , apiResponse} from '../../helper';
import { createTicketSchema, sendMessageSchema, getTicketsSchema, updateTicketSchema, closeTicketSchema, escalateTicketSchema, adminReplySchema, markReadSchema, acceptTicketSchema } from '../../validation';
import { generateTicketId, generateGreeting, processUserMessage, saveBotMessage, escalateTicketToAdmin } from '../../services/chatbotEngine';
import { getSocketInstance } from '../../services/socket';

// ====================== User Endpoints =======================

export const createTicket = async (req, res) => {
    reqInfo(req);
    try {
        const user = req.headers.user || (req as any).user;
        const { error, value } = createTicketSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const ticketId = generateTicketId();
        const subject = value.subject || `Support Request - ${value.category?.replace(/_/g, ' ') || 'General'}`;

        const ticket = await createData(supportTicketModel, {
            userId: user._id,
            ticketId,
            orderId: value.orderId || null,
            category: value.category || TICKET_CATEGORY.OTHER,
            subject,
            status: TICKET_STATUS.BOT_HANDLING,
            priority: TICKET_PRIORITY.MEDIUM,
        });

        if (value.message) {
            await createData(chatMessageModel, {
                ticketId: ticket._id,
                senderId: user._id,
                senderType: SENDER_TYPE.USER,
                messageType: MESSAGE_TYPE.TEXT,
                content: value.message,
            });
        }

        const greeting = generateGreeting(value.category);
        await saveBotMessage(ticket._id.toString(), greeting);

        await redisDelPattern('support:tickets:*');
        await redisDelPattern('support:stats');

        return res.status(HTTP_STATUS.CREATED).json(new apiResponse(HTTP_STATUS.CREATED, responseMessage.ticketCreated, {
            ticketId: ticket.ticketId,
            _id: ticket._id,
            category: ticket.category,
            subject: ticket.subject,
            status: ticket.status,
            createdAt: ticket.createdAt,
        }, {}));
    } catch (error) {
        console.error('[Support] Create ticket error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const sendMessage = async (req, res) => {
    reqInfo(req);
    try {
        const user = req.headers.user || (req as any).user;
        const { error, value } = sendMessageSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const ticket = await getFirstMatch(supportTicketModel, { _id: value.ticketId, isDeleted: false });
        if (!ticket) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, responseMessage.ticketNotFound, {}, {}));
        }

        if (ticket.status === TICKET_STATUS.CLOSED) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, responseMessage.cannotMessageClosedTicket, {}, {}));
        }

        const userMessage = await createData(chatMessageModel, {
            ticketId: ticket._id,
            senderId: user._id,
            senderType: SENDER_TYPE.USER,
            messageType: MESSAGE_TYPE.TEXT,
            content: value.content,
            isRead: false,
        });

        try {
            const io = getSocketInstance();
            if (io) {
                io.to(`ticket_${ticket._id}`).emit('new_message', {
                    _id: userMessage._id,
                    ticketId: ticket._id,
                    senderId: user._id,
                    senderType: SENDER_TYPE.USER,
                    messageType: MESSAGE_TYPE.TEXT,
                    content: value.content,
                    createdAt: userMessage.createdAt,
                });
            }
        } catch (err) {
            console.error('[Support] Socket emit error:', err);
        }

        if (ticket.status === TICKET_STATUS.BOT_HANDLING || ticket.status === TICKET_STATUS.ESCALATED) {
            const botResponse = await processUserMessage(ticket._id.toString(), user._id.toString(), value.content);

            if (botResponse && botResponse.content) {
                const savedBotMsg = await saveBotMessage(ticket._id.toString(), botResponse);

                if (botResponse.escalate && ticket.status !== TICKET_STATUS.ESCALATED) {
                    await escalateTicketToAdmin(ticket._id.toString(), "Bot could not resolve - escalated");
                    ticket.status = TICKET_STATUS.ESCALATED; 
                }
            }
        }

        await redisDelPattern(`support:chat:${ticket._id}:*`);
        await redisDelPattern(`support:ticket:${ticket._id}:*`);

        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.messageSent, {
            messageId: userMessage._id,
            ticketId: ticket._id,
            ticketStatus: ticket.status,
        }, {}));
    } catch (error) {
        console.error('[Support] Send message error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const getTickets = async (req, res) => {
    reqInfo(req);
    try {
        const user = req.headers.user || (req as any).user;
        const { error, value } = getTicketsSchema.validate(req.query || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const { criteria, options, page, limit } = resolveSortAndFilter(value, ['ticketId', 'subject', 'orderId']);

        if (user.role === USER_ROLE.USER) {
            criteria.userId = user._id;
        }

        if (value.status) criteria.status = value.status;
        if (value.category) criteria.category = value.category;
        if (value.priority) criteria.priority = value.priority;

        const cacheUserKey = user.role === USER_ROLE.USER ? user._id.toString() : 'admin';
        const queryKey = Object.keys(value).sort().map((key) => `${key}=${JSON.stringify(value[key])}`).join('&') || 'none';
        const cacheKey = `support:tickets:${cacheUserKey}:${queryKey}`;

        const cachedResult = await redisGet(cacheKey);
        if (cachedResult) {
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Support tickets"), cachedResult, {}));
        }

        options.populate = { path: 'userId', select: 'username name email' };

        const response = await getDataWithSorting(supportTicketModel, criteria, {}, options);
        const totalCount = await countData(supportTicketModel, criteria);
        const result = {
            data: response,
            totalData: totalCount,
            state: { page, limit, page_limit: Math.ceil(totalCount / limit) || 1 }
        };

        await redisSet(cacheKey, JSON.stringify(result), 120);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Support tickets"), result, {}));
    } catch (error) {
        console.error('[Support] Get tickets error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const getTicketById = async (req, res) => {
    reqInfo(req);
    try {
        const user = req.headers.user || (req as any).user;
        const ticketId = req.params.ticketId;

        if (!ticketId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, "ticketId is required", {}, {}));
        }

        const criteria: any = { isDeleted: false };
        if (ticketId.match(/^[0-9a-fA-F]{24}$/)) {
            criteria._id = ticketId;
        } else {
            criteria.ticketId = ticketId;
        }
        
        if (user.role === USER_ROLE.USER) {
            criteria.userId = user._id;
        }

        const cacheKey = `support:ticket:${ticketId}:${user.role === USER_ROLE.USER ? user._id.toString() : 'admin'}`;
        const cachedResult = await redisGet(cacheKey);
        if (cachedResult) {
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Support ticket"), cachedResult, {}));
        }

        const ticket = await getFirstMatch(supportTicketModel, criteria, {}, {
            populate: [
                { path: 'userId', select: 'username name email' },
                { path: 'transactionId', select: 'orderId traId amount status gateway' },
                { path: 'assignedTo', select: 'username name email' },
            ]
        });

        if (!ticket) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, responseMessage.ticketNotFound, {}, {}));
        }

        const recentMessages = await getDataWithSorting(chatMessageModel,
            { ticketId: ticket._id, isDeleted: false },
            {},
            { sort: { createdAt: -1 }, limit: 20 }
        );

        const result = { ticket, recentMessages: recentMessages.reverse(), };
        await redisSet(cacheKey, JSON.stringify(result), 60);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Support ticket"), result, {}));
    } catch (error) {
        console.error('[Support] Get ticket by ID error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const getChatHistory = async (req, res) => {
    reqInfo(req);
    try {
        const user = req.headers.user || (req as any).user;
        const ticketId = req.params.ticketId;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;

        if (!ticketId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, "ticketId is required", {}, {}));
        }

        const ticketCriteria: any = { _id: ticketId, isDeleted: false };
        if (user.role === USER_ROLE.USER) {
            ticketCriteria.userId = user._id;
        }
        const ticket = await getFirstMatch(supportTicketModel, ticketCriteria);
        if (!ticket) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, responseMessage.ticketNotFound, {}, {}));
        }

        const cacheKey = `support:chat:${ticketId}:${page}:${limit}`;
        const cachedResult = await redisGet(cacheKey);
        if (cachedResult) {
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Chat history"),  cachedResult, {}));
        }

        const skip = (page - 1) * limit;
        const messages = await getDataWithSorting(chatMessageModel,
            { ticketId, isDeleted: false },
            {},
            { sort: { createdAt: 1 }, skip, limit }
        );
        const totalCount = await countData(chatMessageModel, { ticketId, isDeleted: false });

        const result = {
            data: messages,
            totalData: totalCount,
            state: { page, limit, page_limit: Math.ceil(totalCount / limit) || 1 },
        };

        await redisSet(cacheKey, JSON.stringify(result), 60);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Chat history"), result, {}));
    } catch (error) {
        console.error('[Support] Get chat history error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const closeTicket = async (req, res) => {
    reqInfo(req);
    try {
        const user = req.headers.user || (req as any).user;
        const { error, value } = closeTicketSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const criteria: any = { _id: value.ticketId, isDeleted: false };
        if (user.role === USER_ROLE.USER) {
            criteria.userId = user._id;
        }

        const ticket = await getFirstMatch(supportTicketModel, criteria);
        if (!ticket) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, responseMessage.ticketNotFound, {}, {}));
        }

        if (ticket.status === TICKET_STATUS.CLOSED) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, responseMessage.ticketAlreadyClosed, {}, {}));
        }

        const updatedTicket = await updateData(supportTicketModel, { _id: value.ticketId }, {
            status: TICKET_STATUS.CLOSED,
            closedAt: new Date(),
            resolution: value.resolution || 'Closed by ' + (user.role === USER_ROLE.ADMIN ? 'admin' : 'user'),
        });

        await saveBotMessage(ticket._id.toString(), {
            content: `Ticket closed by ${user.role === USER_ROLE.ADMIN ? 'admin' : 'user'}. ${value.resolution ? 'Resolution: ' + value.resolution : ''}`,
            messageType: MESSAGE_TYPE.SYSTEM,
        });

        await redisDelPattern('support:tickets:*');
        await redisDelPattern(`support:chat:${ticket._id}:*`);
        await redisDelPattern(`support:ticket:${ticket._id}:*`);
        await redisDelPattern('support:stats');

        try {
            const io = getSocketInstance();
            if (io) {
                io.to(`ticket_${ticket._id}`).emit('ticket_closed', { ticketId: ticket.ticketId, _id: ticket._id });
            }
        } catch (err) { console.error('[Support] Socket error:', err); }

        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.ticketClosed, { ticket: updatedTicket }, {}));
    } catch (error) {
        console.error('[Support] Close ticket error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const escalateTicket = async (req, res) => {
    reqInfo(req);
    try {
        const user = req.headers.user || (req as any).user;
        const { error, value } = escalateTicketSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const ticket = await getFirstMatch(supportTicketModel, { _id: value.ticketId, userId: user._id, isDeleted: false });
        if (!ticket) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, responseMessage.ticketNotFound, {}, {}));
        }

        if (ticket.status === TICKET_STATUS.ESCALATED) {
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Ticket is already escalated", {}, {}));
        }

        if (ticket.status === TICKET_STATUS.CLOSED || ticket.status === TICKET_STATUS.RESOLVED) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, responseMessage.ticketAlreadyResolved, {}, {}));
        }

        await escalateTicketToAdmin(ticket._id.toString(), value.reason || "User requested human support");

        await saveBotMessage(ticket._id.toString(), {
            content: responseMessage.ticketEscalated,
            messageType: MESSAGE_TYPE.SYSTEM,
        });

        await redisDelPattern('support:tickets:*');
        await redisDelPattern('support:stats');

        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.ticketEscalated, { ticketId: ticket.ticketId }, {}));
    } catch (error) {
        console.error('[Support] Escalate ticket error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const markMessagesRead = async (req, res) => {
    reqInfo(req);
    try {
        const user = req.headers.user || (req as any).user;
        const { error, value } = markReadSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const criteria: any = { _id: value.ticketId, isDeleted: false };
        if (user.role === USER_ROLE.USER) {
            criteria.userId = user._id;
        }
        const ticket = await getFirstMatch(supportTicketModel, criteria);
        if (!ticket) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, responseMessage.ticketNotFound, {}, {}));
        }

        const senderTypeToMark = user.role === USER_ROLE.ADMIN
            ? { $in: [SENDER_TYPE.USER, SENDER_TYPE.BOT] }
            : { $in: [SENDER_TYPE.BOT, SENDER_TYPE.ADMIN] };

        await chatMessageModel.updateMany(
            { ticketId: ticket._id, senderType: senderTypeToMark, isRead: false },
            { isRead: true }
        );

        await redisDelPattern(`support:chat:${ticket._id}:*`);

        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.messagesMarkedRead, {}, {}));
    } catch (error) {
        console.error('[Support] Mark read error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

// ====================== Admin Endpoints =======================

export const acceptTicket = async (req, res) => {
    reqInfo(req);
    try {
        const admin = req.headers.user || (req as any).user;
        const { error, value } = acceptTicketSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const ticket = await getFirstMatch(supportTicketModel, { _id: value.ticketId, isDeleted: false });
        if (!ticket) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, responseMessage.ticketNotFound, {}, {}));
        }

        if (ticket.assignedTo && ticket.assignedTo.toString() !== admin._id.toString()) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(new apiResponse(HTTP_STATUS.FORBIDDEN, "Ticket is already accepted by another agent", {}, {}));
        }

        const updatedTicket = await updateData(supportTicketModel, { _id: value.ticketId }, {
            assignedTo: admin._id,
            status: TICKET_STATUS.OPEN,
        });

        try {
            const io = getSocketInstance();
            if (io) {
                io.to('admin_support').emit('ticket_accepted', {
                    ticketId: ticket.ticketId,
                    _id: ticket._id,
                    assignedTo: admin._id,
                });
            }
        } catch (err) { console.error('[Support] Socket error:', err); }

        await redisDelPattern('support:tickets:*');

        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Ticket accepted successfully", { ticket: updatedTicket }, {}));
    } catch (error) {
        console.error('[Support] Accept ticket error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const adminReply = async (req, res) => {
    reqInfo(req);
    try {
        const admin = req.headers.user || (req as any).user;
        const { error, value } = adminReplySchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const ticket = await getFirstMatch(supportTicketModel, { _id: value.ticketId, isDeleted: false });
        if (!ticket) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, responseMessage.ticketNotFound, {}, {}));
        }

        if (ticket.status === TICKET_STATUS.CLOSED) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, responseMessage.cannotMessageClosedTicket, {}, {}));
        }

        if (ticket.assignedTo && ticket.assignedTo.toString() !== admin._id.toString()) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(new apiResponse(HTTP_STATUS.FORBIDDEN, "Ticket is already accepted by another agent", {}, {}));
        }

        const adminMessage = await createData(chatMessageModel, {
            ticketId: ticket._id,
            senderId: admin._id,
            senderType: SENDER_TYPE.ADMIN,
            messageType: MESSAGE_TYPE.TEXT,
            content: value.content,
        });

        const updateFields: any = {};
        if (!ticket.assignedTo) {
            updateFields.assignedTo = admin._id;
        }
        if (ticket.status === TICKET_STATUS.ESCALATED) {
            updateFields.status = TICKET_STATUS.OPEN; 
        }
        if (Object.keys(updateFields).length > 0) {
            await updateData(supportTicketModel, { _id: value.ticketId }, updateFields);
        }

        try {
            const io = getSocketInstance();
            if (io) {
                io.to(`ticket_${ticket._id}`).emit('new_message', {
                    _id: adminMessage._id,
                    ticketId: ticket._id,
                    senderId: admin._id,
                    senderType: SENDER_TYPE.ADMIN,
                    messageType: MESSAGE_TYPE.TEXT,
                    content: value.content,
                    createdAt: adminMessage.createdAt,
                });

                io.to(`user_${ticket.userId}`).emit('admin_reply', {
                    ticketId: ticket.ticketId,
                    _id: ticket._id,
                    content: value.content,
                });
            }
        } catch (err) { console.error('[Support] Socket error:', err); }

        await redisDelPattern(`support:chat:${ticket._id}:*`);
        await redisDelPattern(`support:ticket:${ticket._id}:*`);
        await redisDelPattern('support:tickets:*');

        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.adminReplySent, {
            messageId: adminMessage._id,
            ticketId: ticket.ticketId,
        }, {}));
    } catch (error) {
        console.error('[Support] Admin reply error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const adminUpdateTicket = async (req, res) => {
    reqInfo(req);
    try {
        const admin = req.headers.user || (req as any).user;
        const { error, value } = updateTicketSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const ticket = await getFirstMatch(supportTicketModel, { _id: value.ticketId, isDeleted: false });
        if (!ticket) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, responseMessage.ticketNotFound, {}, {}));
        }

        const updateFields: any = {};
        if (value.status) {
            updateFields.status = value.status;
            if (value.status === TICKET_STATUS.RESOLVED) {
                updateFields.resolvedAt = new Date();
                updateFields.botResolved = false;
            }
            if (value.status === TICKET_STATUS.CLOSED) {
                updateFields.closedAt = new Date();
            }
        }
        if (value.priority) updateFields.priority = value.priority;
        if (value.assignedTo) updateFields.assignedTo = value.assignedTo;
        if (value.resolution) updateFields.resolution = value.resolution;

        const updatedTicket = await updateData(supportTicketModel, { _id: value.ticketId }, updateFields);

        if (value.status === TICKET_STATUS.RESOLVED) {
            await saveBotMessage(ticket._id.toString(), {
                content: `Your ticket has been resolved by our support team. ${value.resolution ? 'Resolution: ' + value.resolution : ''}`,
                messageType: MESSAGE_TYPE.SYSTEM,
            });
        }

        try {
            const io = getSocketInstance();
            if (io) {
                io.to(`ticket_${ticket._id}`).emit('ticket_updated', {
                    ticketId: ticket.ticketId,
                    _id: ticket._id,
                    status: updatedTicket.status,
                    priority: updatedTicket.priority,
                });
            }
        } catch (err) { console.error('[Support] Socket error:', err); }

        await redisDelPattern('support:tickets:*');
        await redisDelPattern('support:stats');
        await redisDelPattern(`support:ticket:${ticket._id}:*`);

        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.ticketUpdated, { ticket: updatedTicket }, {}));
    } catch (error) {
        console.error('[Support] Admin update ticket error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const getEscalatedTickets = async (req, res) => {
    reqInfo(req);
    try {
        const { error, value } = getTicketsSchema.validate(req.query || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const { criteria, options, page, limit } = resolveSortAndFilter(value, ['ticketId', 'subject', 'orderId']);
        criteria.status = TICKET_STATUS.ESCALATED;
        criteria.$or = [{ assignedTo: null }, { assignedTo: { $exists: false } }];

        if (value.category) criteria.category = value.category;
        if (value.priority) criteria.priority = value.priority;

        options.populate = [
            { path: 'userId', select: 'username name email' },
            { path: 'transactionId', select: 'orderId traId amount status gateway' },
        ];

        const cacheKey = `support:tickets:escalated:${JSON.stringify(value)}`;
        const cachedResult = await redisGet(cacheKey);
        if (cachedResult) {
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Escalated tickets"), cachedResult, {}));
        }

        const response = await getDataWithSorting(supportTicketModel, criteria, {}, options);
        const totalCount = await countData(supportTicketModel, criteria);
        const result = {
            data: response,
            totalData: totalCount,
            state: { page, limit, page_limit: Math.ceil(totalCount / limit) || 1 },
        };

        await redisSet(cacheKey, JSON.stringify(result), 60);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Escalated tickets"), result, {}));
    } catch (error) {
        console.error('[Support] Get escalated tickets error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const getTicketStats = async (req, res) => {
    reqInfo(req);
    try {
        const cacheKey = 'support:stats';
        const cachedResult = await redisGet(cacheKey);
        if (cachedResult) {
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Ticket statistics"), cachedResult, {}));
        }

        const baseCriteria = { isDeleted: false };

        const [total, open, botHandling, escalated, resolved, closed] = await Promise.all([
            countData(supportTicketModel, baseCriteria),
            countData(supportTicketModel, { ...baseCriteria, status: TICKET_STATUS.OPEN }),
            countData(supportTicketModel, { ...baseCriteria, status: TICKET_STATUS.BOT_HANDLING }),
            countData(supportTicketModel, { ...baseCriteria, status: TICKET_STATUS.ESCALATED }),
            countData(supportTicketModel, { ...baseCriteria, status: TICKET_STATUS.RESOLVED }),
            countData(supportTicketModel, { ...baseCriteria, status: TICKET_STATUS.CLOSED }),
        ]);

        const [low, medium, high, critical] = await Promise.all([
            countData(supportTicketModel, { ...baseCriteria, priority: TICKET_PRIORITY.LOW, status: { $nin: [TICKET_STATUS.CLOSED, TICKET_STATUS.RESOLVED] } }),
            countData(supportTicketModel, { ...baseCriteria, priority: TICKET_PRIORITY.MEDIUM, status: { $nin: [TICKET_STATUS.CLOSED, TICKET_STATUS.RESOLVED] } }),
            countData(supportTicketModel, { ...baseCriteria, priority: TICKET_PRIORITY.HIGH, status: { $nin: [TICKET_STATUS.CLOSED, TICKET_STATUS.RESOLVED] } }),
            countData(supportTicketModel, { ...baseCriteria, priority: TICKET_PRIORITY.CRITICAL, status: { $nin: [TICKET_STATUS.CLOSED, TICKET_STATUS.RESOLVED] } }),
        ]);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayCount = await countData(supportTicketModel, { ...baseCriteria, createdAt: { $gte: todayStart } });

        const unreadMessages = await countData(chatMessageModel, {
            senderType: SENDER_TYPE.USER,
            isRead: false,
            isDeleted: false,
        });

        const result = {
            total,
            byStatus: { open, botHandling, escalated, resolved, closed },
            byPriority: { low, medium, high, critical },
            activeTickets: open + botHandling + escalated,
            todayCount,
            unreadMessages,
        };

        await redisSet(cacheKey, JSON.stringify(result), 120);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Ticket statistics"), result, {}));
    } catch (error) {
        console.error('[Support] Get ticket stats error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};
