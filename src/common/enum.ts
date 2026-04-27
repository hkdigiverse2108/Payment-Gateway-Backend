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
    PROCESSING: "processing"
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