import { supportTicketModel, chatMessageModel, transactionModel } from '../database';
import { TICKET_STATUS, TICKET_CATEGORY, SENDER_TYPE, MESSAGE_TYPE, ORDER_STATUS, TICKET_PRIORITY, ESCALATION_KEYWORDS, BOT_INTENTS, BOT_INTENT_TYPES } from '../common';
import { createData, getFirstMatch, getDataWithSorting, updateData } from '../helper';
import { getSocketInstance } from './socket';
import crypto from 'crypto';

// Maximum consecutive unrecognized messages before auto-escalation
const MAX_UNRECOGNIZED_ATTEMPTS = 4;

interface BotResponse {
    content: string;
    messageType: string;
    resolved?: boolean;
    escalate?: boolean;
}

export const generateTicketId = (): string => {
    return `TKT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
};

export const generateGreeting = (category?: string): BotResponse => {
    let content = "Hello! 👋 I'm your Payment Support Assistant. How can I help you today?";

    if (category && category !== TICKET_CATEGORY.OTHER) {
        content = `Hello! 👋 I see you're having an issue with ${formatCategory(category)}. Could you please provide more details?`;
    }

    return {
        content,
        messageType: MESSAGE_TYPE.TEXT,
    };
};

const analyzeMessageIntent = (message: string): string | null => {
    const normalizedMessage = message.toLowerCase().trim();

    for (const keyword of ESCALATION_KEYWORDS) {
        if (normalizedMessage.includes(keyword)) {
            return 'ESCALATE';
        }
    }

    const greetingRegex = /^(h+e*l+o+|h+i+|h+y+|h+e+y+|a+|o+k+)$/i;
    const punctuationOnlyRegex = /^[.\-,!?\s]+$/;
    if (greetingRegex.test(normalizedMessage) || punctuationOnlyRegex.test(normalizedMessage) || normalizedMessage.length <= 2) {
        return BOT_INTENT_TYPES.GREETING;
    }
    
    let bestIntent = null;
    let highestScore = 0;

    for (const intent of BOT_INTENTS) {
        let matches = 0;
        for (const keyword of intent.keywords) {
            if (normalizedMessage.includes(keyword)) {
                matches++;
            }
        }
        const score = matches / intent.keywords.length;
        if (score > highestScore) {
            highestScore = score;
            bestIntent = intent.name;
        }
    }
    
    if (highestScore >= 0.5) {
        return bestIntent;
    }
    
    return null;
};

export const processUserMessage = async (
    ticketId: string,
    userId: string,
    message: string,
    selectedOption?: string
): Promise<BotResponse> => {
    const ticket = await getFirstMatch(supportTicketModel, { _id: ticketId, isDeleted: false });
    if (!ticket) {
        return { content: "Sorry, I couldn't find your support ticket.", messageType: MESSAGE_TYPE.TEXT };
    }
    if (ticket.status === TICKET_STATUS.ESCALATED) {
        const lowerMsg = message.toLowerCase().trim();
        if (lowerMsg === 'ok' || lowerMsg === 'okay' || lowerMsg.includes('thanks') || lowerMsg.includes('thank you')) {
            return { content: "Thank you for your patience and for reporting this issue! Have a wonderful day ahead. 😊", messageType: MESSAGE_TYPE.SYSTEM };
        }
        return { content: "Okay, please wait. Your ticket has been escalated to our support team and an admin will connect with you shortly.", messageType: MESSAGE_TYPE.SYSTEM };
    }
    if (ticket.status === TICKET_STATUS.RESOLVED || ticket.status === TICKET_STATUS.CLOSED) {
        return { content: "This ticket has already been resolved. Please create a new ticket if you need further assistance.", messageType: MESSAGE_TYPE.SYSTEM };
    }

    const lowerMsgRaw = message.toLowerCase().trim();
    if (lowerMsgRaw === 'ok' || lowerMsgRaw === 'okay' || lowerMsgRaw.includes('thanks') || lowerMsgRaw.includes('thank you')) {
        await updateData(supportTicketModel, { _id: ticketId }, {
            status: TICKET_STATUS.RESOLVED,
            botResolved: true,
            resolvedAt: new Date(),
            resolution: 'Resolved by bot (user satisfied)'
        });
        return {
            content: "Thank you for contacting us! Have a wonderful day ahead. 😊",
            messageType: MESSAGE_TYPE.SYSTEM
        };
    }

    const intent = analyzeMessageIntent(message);

    if (intent === 'ESCALATE') {
        return await generateEscalationResponse(ticketId, userId, "User explicitly requested human support", "I understand this needs human attention. I'm connecting you with our support team right away. 🙏");
    }

    if (!intent) {
        if (ticket.metadata?.lastIntent) {
            if (ticket.metadata.lastIntent === BOT_INTENT_TYPES.TECHNICAL_ISSUE) {
                return {
                    content: "Thank you for the details. I have forwarded this information to our team. They will check and resolve it as soon as possible.",
                    messageType: MESSAGE_TYPE.SYSTEM,
                    escalate: true,
                };
            }
            // User is answering the bot's follow-up question (e.g. providing an Order ID)
            return await generateEscalationResponse(ticketId, userId, `User provided details for ${ticket.metadata.lastIntent}`, "Thank you for the details. I have forwarded this information to our backend team. They will check and resolve it as soon as possible.");
        }

        await updateData(supportTicketModel, { _id: ticketId }, { $inc: { botAttempts: 1 } });
        ticket.botAttempts = (ticket.botAttempts || 0) + 1;

        if (ticket.botAttempts >= MAX_UNRECOGNIZED_ATTEMPTS) {
            return await generateEscalationResponse(ticketId, userId, "Maximum unrecognized attempts reached (AI could not understand)", "I am having trouble understanding your issue. Let me connect you with an admin who can help. 🙏");
        }

        return {
            content: "I didn't quite catch that. Could you please clarify your issue? Or type 'talk to agent' if you'd like to connect with a human.",
            messageType: MESSAGE_TYPE.TEXT,
        };
    }

    if (intent !== BOT_INTENT_TYPES.GREETING && ticket.metadata?.lastIntent === intent) {
        if (intent === BOT_INTENT_TYPES.TECHNICAL_ISSUE) {
            return {
                content: "Thank you for the details. I have forwarded this information to our backend team. They will check and resolve it as soon as possible.",
                messageType: MESSAGE_TYPE.SYSTEM,
                escalate: true,
            };
        }
        return await generateEscalationResponse(ticketId, userId, "User provided follow-up details (preventing AI loop)", "Thank you for the details. I have forwarded this information to our backend team. They will check and resolve it as soon as possible.");
    }

    const updatedMetadata = { ...(ticket.metadata || {}), lastIntent: intent };
    await updateData(supportTicketModel, { _id: ticketId }, { botAttempts: 0, metadata: updatedMetadata });

    switch (intent) {
        case BOT_INTENT_TYPES.GREETING:
            return {
                content: "Hello! 👋 How can I help you today? You can ask me about payments, refunds, or technical issues.",
                messageType: MESSAGE_TYPE.TEXT,
            };
        case BOT_INTENT_TYPES.PAYMENT_FAILED:
            return await handlePaymentFailed(ticket, userId);
        case BOT_INTENT_TYPES.PAYMENT_PENDING:
            return await handlePaymentPending(ticket, userId);
        case BOT_INTENT_TYPES.REFUND:
            return await handleRefundRequest(ticket, userId);
        case BOT_INTENT_TYPES.WITHDRAWAL:
            return await handleWithdrawalIssue(ticket, userId);
        case BOT_INTENT_TYPES.ACCOUNT:
            return await handleAccountIssue(ticket, userId);
        case BOT_INTENT_TYPES.PAYMENT_NOT_ADDED:
            return await handlePaymentNotAdded(ticket, userId);
        case BOT_INTENT_TYPES.MONEY_DEDUCTED:
            return await handleMoneyDeducted(ticket, userId);
        case BOT_INTENT_TYPES.TRANSACTION_STATUS:
            return await handleTransactionStatus(ticket, userId);
        case BOT_INTENT_TYPES.TECHNICAL_ISSUE:
            return await handleTechnicalIssue(ticket, userId);
        default:
            return {
                content: "I didn't quite catch that. Could you please clarify?",
                messageType: MESSAGE_TYPE.TEXT,
            };
    }
};

const handleTechnicalIssue = async (ticket: any, userId: string): Promise<BotResponse> => {
    await updateData(supportTicketModel, { _id: ticket._id }, { category: TICKET_CATEGORY.OTHER, status: TICKET_STATUS.BOT_HANDLING });

    return {
        content: "I understand you're facing a technical issue with our website. Our technical team usually fixes these quickly. Could you describe exactly which page, link, or button is causing the error?",
        messageType: MESSAGE_TYPE.TEXT,
    };
};

const handlePaymentFailed = async (ticket: any, userId: string): Promise<BotResponse> => {
    await updateData(supportTicketModel, { _id: ticket._id }, { category: TICKET_CATEGORY.PAYMENT_FAILED, status: TICKET_STATUS.BOT_HANDLING });

    const failedTransactions = await getDataWithSorting(
        transactionModel,
        { userId, status: { $regex: /failed/i }, isDeleted: false },
        { orderId: 1, traId: 1, amount: 1, gateway: 1, status: 1, createdAt: 1 },
        { sort: { createdAt: -1 }, limit: 5 }
    );

    if (failedTransactions && failedTransactions.length > 0) {
        const txnList = failedTransactions.map((txn: any, i: number) =>
            `${i + 1}. Order: ${txn.orderId} | ₹${txn.amount} | Date: ${new Date(txn.createdAt).toLocaleDateString('en-IN')}`
        ).join('\n');

        return {
            content: `I found your recent failed payment(s):\n\n${txnList}\n\nThis usually happens due to bank timeouts or incorrect details. If money was deducted, it will be refunded within 5-7 days. Do you need further help with this? (Type 'talk to agent' to connect with human)`,
            messageType: MESSAGE_TYPE.TEXT,
        };
    }
    return {
        content: "I couldn't find any recent failed payments on your account. Could you provide your Order ID, or type 'talk to agent' to connect with human?",
        messageType: MESSAGE_TYPE.TEXT,
    };
};

const handlePaymentPending = async (ticket: any, userId: string): Promise<BotResponse> => {
    await updateData(supportTicketModel, { _id: ticket._id }, { category: TICKET_CATEGORY.PAYMENT_PENDING, status: TICKET_STATUS.BOT_HANDLING });

    const pendingTransactions = await getDataWithSorting(
        transactionModel,
        { userId, status: { $regex: /pending/i }, isDeleted: false },
        { orderId: 1, traId: 1, amount: 1, gateway: 1, status: 1, createdAt: 1 },
        { sort: { createdAt: -1 }, limit: 5 }
    );

    if (pendingTransactions && pendingTransactions.length > 0) {
        const txnList = pendingTransactions.map((txn: any, i: number) =>
            `${i + 1}. Order: ${txn.orderId} | ₹${txn.amount}`
        ).join('\n');

        return {
            content: `I found ${pendingTransactions.length} pending payment(s):\n\n${txnList}\n\n⏳ Pending payments usually resolve within 5 to 30 minutes depending on the gateway or your bank. If you want an agent to look into it, just type 'talk to agent'.`,
            messageType: MESSAGE_TYPE.TEXT,
        };
    }
    return {
        content: "I don't see any pending payments right now. Could you provide the Order ID?",
        messageType: MESSAGE_TYPE.TEXT,
    };
};

const handleRefundRequest = async (ticket: any, userId: string): Promise<BotResponse> => {
    await updateData(supportTicketModel, { _id: ticket._id }, { category: TICKET_CATEGORY.REFUND, status: TICKET_STATUS.BOT_HANDLING });

    return {
        content: "For any refund related issues, please note that refunds typically take 5-7 working days to reflect in your bank account depending on your bank's processing time. If it has been longer than 7 days, please type 'talk to agent' to escalate.",
        messageType: MESSAGE_TYPE.TEXT,
    };
};

const handlePaymentNotAdded = async (ticket: any, userId: string): Promise<BotResponse> => {
    await updateData(supportTicketModel, { _id: ticket._id }, { category: TICKET_CATEGORY.OTHER, status: TICKET_STATUS.BOT_HANDLING });
    return {
        content: "If your payment was successful but the amount is not added to your wallet, please provide the Order ID so our support team can verify the transaction hash and update it manually.",
        messageType: MESSAGE_TYPE.TEXT,
    };
};

const handleMoneyDeducted = async (ticket: any, userId: string): Promise<BotResponse> => {
    await updateData(supportTicketModel, { _id: ticket._id }, { category: TICKET_CATEGORY.PAYMENT_FAILED, status: TICKET_STATUS.BOT_HANDLING });
    return {
        content: "If money was deducted from your bank but the transaction failed or is pending, the bank usually auto-refunds it within 5-7 working days. If you still have concerns, please provide the Order ID.",
        messageType: MESSAGE_TYPE.TEXT,
    };
};

const handleTransactionStatus = async (ticket: any, userId: string): Promise<BotResponse> => {
    await updateData(supportTicketModel, { _id: ticket._id }, { category: TICKET_CATEGORY.OTHER, status: TICKET_STATUS.BOT_HANDLING });
    return {
        content: "Sometimes the transaction status may take a few minutes to sync with the gateway. Please wait a few minutes and refresh. If the status is still incorrect, please provide your Order ID so our agent can check the actual status.",
        messageType: MESSAGE_TYPE.TEXT,
    };
};

const handleWithdrawalIssue = async (ticket: any, userId: string): Promise<BotResponse> => {
    await updateData(supportTicketModel, { _id: ticket._id }, { category: TICKET_CATEGORY.WITHDRAWAL, status: TICKET_STATUS.BOT_HANDLING });

    return {
        content: "I see you're having a withdrawal issue. Could you please provide more details about it? (e.g. withdrawal stuck, amount not credited)",
        messageType: MESSAGE_TYPE.TEXT,
    };
};

const handleAccountIssue = async (ticket: any, userId: string): Promise<BotResponse> => {
    await updateData(supportTicketModel, { _id: ticket._id }, { category: TICKET_CATEGORY.ACCOUNT, status: TICKET_STATUS.BOT_HANDLING });

    return {
        content: "What kind of account issue are you facing? (Login problem, API key issue, Wallet balance mismatch)",
        messageType: MESSAGE_TYPE.TEXT,
    };
};

const generateEscalationResponse = async (ticketId: string, userId: string, reason: string, customMessage?: string): Promise<BotResponse> => {
    return {
        content: customMessage || "I understand this needs human attention. I'm connecting you with our support team right away. An admin will respond to your ticket shortly. 🙏",
        messageType: MESSAGE_TYPE.SYSTEM,
        escalate: true,
    };
};

export const escalateTicketToAdmin = async (ticketId: string, reason: string): Promise<void> => {
    await updateData(supportTicketModel, { _id: ticketId }, {
        status: TICKET_STATUS.ESCALATED,
        assignedTo: null,
        escalatedAt: new Date(),
        priority: TICKET_PRIORITY.HIGH,
    });

    const ticket = await getFirstMatch(supportTicketModel, { _id: ticketId }, {}, { populate: { path: 'userId', select: 'username name email' } });
    if (!ticket) return;

    try { const io = getSocketInstance();
        if (io) {
            io.to('admin_support').emit('ticket_escalated', {
                ticketId: ticket.ticketId,
                _id: ticket._id,
                category: ticket.category,
                subject: ticket.subject,
                userId: ticket.userId,
                priority: ticket.priority,
                createdAt: ticket.createdAt,
            });
        }
    } catch (err) {
        console.error('Socket emit error on escalation:', err);
    }
};

export const saveBotMessage = async (ticketId: string, response: BotResponse): Promise<any> => {
    const message = await createData(chatMessageModel, {
        ticketId,
        senderId: null,
        senderType: SENDER_TYPE.BOT,
        messageType: response.messageType,
        content: response.content,
        isRead: false,
    });

    try { const io = getSocketInstance();
        if (io) {
            io.to(`ticket_${ticketId}`).emit('new_message', {
                _id: message._id,
                ticketId,
                senderType: SENDER_TYPE.BOT,
                messageType: response.messageType,
                content: response.content,
                createdAt: message.createdAt,
            });
        }
    } catch (err) {
        console.error('Socket emit error:', err);
    }
    return message;
};

export const autoCreateTicketOnPaymentFailure = async (transaction: any): Promise<void> => {
    try {
        const existingTicket = await getFirstMatch(supportTicketModel, {
            transactionId: transaction._id,
            isDeleted: false,
        });
        if (existingTicket) return; 

        const ticketId = generateTicketId();
        const ticket = await createData(supportTicketModel, {
            userId: transaction.userId,
            ticketId,
            transactionId: transaction._id,
            orderId: transaction.orderId,
            category: TICKET_CATEGORY.PAYMENT_FAILED,
            subject: `Payment Failed - Order ${transaction.orderId} (₹${transaction.amount})`,
            status: TICKET_STATUS.BOT_HANDLING,
            priority: TICKET_PRIORITY.MEDIUM,
            metadata: {
                autoCreated: true,
                gateway: transaction.gateway,
                amount: transaction.amount,
                failedAt: new Date(),
            },
        });

        const greeting: BotResponse = {
            content: `Hello! 👋 We noticed your payment of ₹${transaction.amount} (Order: ${transaction.orderId}) via ${transaction.gateway} has failed.\n\nDon't worry, I'm here to help! Could you provide more details about what went wrong? (or type 'talk to agent')`,
            messageType: MESSAGE_TYPE.TEXT,
        };
        await saveBotMessage(ticket._id.toString(), greeting);
        console.log(`[Support] Auto-created ticket ${ticketId} for failed payment ${transaction.orderId}`);
    } catch (error) {
        console.error('[Support] Error auto-creating ticket on payment failure:', error);
    }
};

const formatCategory = (category: string): string => {
    const map: Record<string, string> = {
        payment_failed: "a failed payment",
        payment_pending: "a pending payment",
        refund: "a refund",
        withdrawal: "a withdrawal",
        account: "your account",
        other: "an issue",
    };
    return map[category] || "an issue";
};
