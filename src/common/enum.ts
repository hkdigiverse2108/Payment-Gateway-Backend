export const USER_ROLE = {
    ADMIN: "admin",
    USER: "user"
} as const;

export const ORDER_STATUS = {
    PENDING: "pending",
    SUCCESS: "success",
    FAILED: "failed",
    EXPIRED: "expired",
    PROCESSING: "processing",
    REJECTED: "rejected"
} as const;

export const PAYMENT_STATUS = {
    PENDING: "pending",
    SUCCESS: "success",
    FAILED: "failed",
    EXPIRED: "expired",
    APPROVED: "approved",
    PROCESSING: "processing",
    CANCELLED: "cancelled",
} as const;

export const TRANSACTION_TYPE = {
    DEPOSIT: "deposit",
    WITHDRAW: "withdraw"
} as const;

export const WALLET_ACTIVITY_TYPE = {
    CREDIT: "credit",
    DEBIT: "debit"
} as const;

export const BULK_UPLOAD_STATUS = {
    PENDING: "pending",
    PROCESSING: "processing",
    SUCCESS: "success",
    FAILED: "failed",
    PARTIAL: "partial"
} as const;

export const PAYMENT_METHOD = {
    UPI: "upi",
    QR: "qr"
} as const;

export const GATEWAY = {
    CASHFREE: "cashfree",
    RAZORPAY: "razorpay",
    PAYU: "payu",
    PAYTM: "paytm",
    PHONEPE: "phonepe",
    STRIPE: "stripe",
    CCAVENUE: "ccavenue"
} as const;

// ====================== Support System Enums =======================

export const TICKET_STATUS = {
    OPEN: "open",
    BOT_HANDLING: "bot_handling",
    ESCALATED: "escalated",
    RESOLVED: "resolved",
    CLOSED: "closed"
} as const;

export const TICKET_CATEGORY = {
    PAYMENT_FAILED: "payment_failed",
    PAYMENT_PENDING: "payment_pending",
    REFUND: "refund",
    WITHDRAWAL: "withdrawal",
    ACCOUNT: "account",
    OTHER: "other"
} as const;

export const TICKET_PRIORITY = {
    LOW: "low",
    MEDIUM: "medium",
    HIGH: "high",
    CRITICAL: "critical"
} as const;

export const SENDER_TYPE = {
    USER: "user",
    BOT: "bot",
    ADMIN: "admin"
} as const;

export const MESSAGE_TYPE = {
    TEXT: "text",
    SYSTEM: "system",
} as const;

export const BOT_INTENT_TYPES = {
    GREETING: "GREETING",
    PAYMENT_FAILED: "PAYMENT_FAILED",
    PAYMENT_PENDING: "PAYMENT_PENDING",
    REFUND: "REFUND",
    WITHDRAWAL: "WITHDRAWAL",
    ACCOUNT: "ACCOUNT",
    PAYMENT_NOT_ADDED: "PAYMENT_NOT_ADDED",
    MONEY_DEDUCTED: "MONEY_DEDUCTED",
    TRANSACTION_STATUS: "TRANSACTION_STATUS",
    TECHNICAL_ISSUE: "TECHNICAL_ISSUE"
} as const;

export const ESCALATION_KEYWORDS = [ "talk to", "agent", "human", "admin", "another person", "boss", "customer care", "support", "contact person", "helpdesk" ];

export const BOT_INTENTS = [
    { name: BOT_INTENT_TYPES.GREETING, keywords: ['hello', 'hi', 'hey', 'hii','hy', 'good morning'] },
    { name: BOT_INTENT_TYPES.PAYMENT_FAILED, keywords: ['payment', 'failed'] },
    { name: BOT_INTENT_TYPES.PAYMENT_PENDING, keywords: ['payment', 'pending'] },
    { name: BOT_INTENT_TYPES.PAYMENT_PENDING, keywords: ['payment', 'stuck'] },
    { name: BOT_INTENT_TYPES.REFUND, keywords: ['refund'] },
    { name: BOT_INTENT_TYPES.WITHDRAWAL, keywords: ['withdraw'] },
    { name: BOT_INTENT_TYPES.ACCOUNT, keywords: ['account'] },
    { name: BOT_INTENT_TYPES.PAYMENT_NOT_ADDED, keywords: ['add', 'wallet'] },
    { name: BOT_INTENT_TYPES.PAYMENT_NOT_ADDED, keywords: ['success', 'not', 'wallet'] },
    { name: BOT_INTENT_TYPES.MONEY_DEDUCTED, keywords: ['money', 'deducted'] },
    { name: BOT_INTENT_TYPES.MONEY_DEDUCTED, keywords: ['amount', 'debited'] },
    { name: BOT_INTENT_TYPES.TRANSACTION_STATUS, keywords: ['status', 'wrong'] },
    { name: BOT_INTENT_TYPES.TRANSACTION_STATUS, keywords: ['status', 'issue'] },
    { name: BOT_INTENT_TYPES.TECHNICAL_ISSUE, keywords: ['button', 'working'] },
    { name: BOT_INTENT_TYPES.TECHNICAL_ISSUE, keywords: ['link', 'broken'] },
    { name: BOT_INTENT_TYPES.TECHNICAL_ISSUE, keywords: ['website', 'error'] },
    { name: BOT_INTENT_TYPES.TECHNICAL_ISSUE, keywords: ['page', 'working'] },
    { name: BOT_INTENT_TYPES.TECHNICAL_ISSUE, keywords: ['network', 'issue'] },
    { name: BOT_INTENT_TYPES.TECHNICAL_ISSUE, keywords: ['server', 'down'] },
    { name: BOT_INTENT_TYPES.TECHNICAL_ISSUE, keywords: ['slow'] },
    { name: BOT_INTENT_TYPES.TECHNICAL_ISSUE, keywords: ['bug'] },
    { name: BOT_INTENT_TYPES.TECHNICAL_ISSUE, keywords: ['loading'] }
];