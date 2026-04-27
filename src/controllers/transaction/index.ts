import { transactionModel } from '../../database';
import { apiResponse, HTTP_STATUS, resolveSortAndFilter, USER_ROLE, TRANSACTION_TYPE, ORDER_STATUS, PAYMENT_STATUS } from '../../common';
import { reqInfo, responseMessage, getDataWithSorting, countData, getData, createData, getFirstMatch } from '../../helper';
import { getTransactionsSchema, createDepositSchema, getTransactionStatusSchema } from '../../validation';
import crypto from 'crypto';
import * as cashfreeService from '../../services';

export const getTransactions = async (req, res) => {
    reqInfo(req);
    try {
        const { error, value } = getTransactionsSchema.validate(req.query || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const { criteria, options, page, limit } = resolveSortAndFilter(value, ['orderId', 'traId', 'utr', 'brand']);

        if (value.type) criteria.type = value.type;
        if (value.status) criteria.status = value.status;
        if (value.paymentStatus) criteria.paymentStatus = value.paymentStatus;

        if (req.user && req.user.role === USER_ROLE.USER) {
            criteria.userId = req.user._id;
        }

        const response = await getDataWithSorting(transactionModel, criteria, {}, options);
        const totalCount = await countData(transactionModel, criteria);

        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Transactions"), {
            data: response,
            totalData: totalCount,
            state: {
                page,
                limit,
                page_limit: Math.ceil(totalCount / limit) || 1
            }
        }, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const exportTransactions = async (req, res) => {
    reqInfo(req);
    try {
        const { error, value } = getTransactionsSchema.validate(req.query || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const { criteria } = resolveSortAndFilter(value, ['orderId', 'traId', 'utr', 'brand']);

        if (value.type) criteria.type = value.type;
        if (value.status) criteria.status = value.status;
        if (value.paymentStatus) criteria.paymentStatus = value.paymentStatus;

        if (req.user && req.user.role === USER_ROLE.USER) {
            criteria.userId = req.user._id;
        }

        const data = await getData(transactionModel, criteria, {}, { sort: { createdAt: -1 } });

        if (data.length === 0) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, "No data found to export", {}, {}));
        }

        const headers = ["Order ID", "Transaction ID", "Type", "Amount", "Status", "Payment Status", "UTR", "Brand", "Date"];
        const rows = data.map(item => [
            item.orderId,
            item.traId,
            item.type,
            item.amount,
            item.status,
            item.paymentStatus,
            item.utr || '',
            item.brand || '',
            new Date(item.createdAt).toLocaleString()
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
        return res.status(HTTP_STATUS.OK).send(csvContent);

    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const createDeposit = async (req, res) => {
    reqInfo(req);
    let { user } = req.headers
    try {
        const { error, value } = createDepositSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const existing = await getFirstMatch(transactionModel, { userId: user._id, orderId: value.orderId });
        if (existing) {
            return res.status(HTTP_STATUS.CONFLICT).json(new apiResponse(HTTP_STATUS.CONFLICT, "Order ID already exists", {}, {}));
        }

        const traId = `DEP${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

        const cashfreeOrder = await cashfreeService.createOrder({
            order_id: traId,
            order_amount: value.amount,
            order_currency: "INR",
            customer_details: {
                customer_id: user._id.toString(),
                customer_phone: value.customerPhone,
                customer_name: value.customerName,
            },
            order_meta: {
                return_url: `${value.returnUrl || 'http://localhost:3000'}/payment-status?order_id=${value.orderId}`,
                notify_url: value.notifyUrl
            }
        });

        const transaction = await createData(transactionModel, {
            userId: user._id,
            orderId: value.orderId,
            traId,
            type: TRANSACTION_TYPE.DEPOSIT,
            amount: value.amount,
            status: ORDER_STATUS.PENDING,
            paymentStatus: PAYMENT_STATUS.PENDING,
            metadata: {
                cashfreeOrderId: cashfreeOrder.cf_order_id,
                paymentSessionId: cashfreeOrder.payment_session_id,
                customerPhone: value.customerPhone,
                customerName: value.customerName,
                customerEmail: value.customerEmail,
                returnUrl: value.returnUrl,
                notifyUrl: value.notifyUrl,
                ...value.metadata
            }
        });

        return res.status(HTTP_STATUS.CREATED).json(new apiResponse(HTTP_STATUS.CREATED, "Deposit request created", {
            orderId: transaction.orderId,
            traId: transaction.traId,
            amount: transaction.amount,
            cashfreeSession: {
                cf_order_id: cashfreeOrder.cf_order_id,
                payment_session_id: cashfreeOrder.payment_session_id,
                order_status: cashfreeOrder.order_status
            }
        }, {}));

    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const getTransactionStatus = async (req, res) => {
    reqInfo(req);
    try {
        const { error, value } = getTransactionStatusSchema.validate(req.query || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const transaction = await getFirstMatch(transactionModel, { userId: req.user._id, orderId: value.orderId });
        if (!transaction) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, "Transaction not found", {}, {}));
        }

        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Transaction status fetched", {
            orderId: transaction.orderId,
            traId: transaction.traId,
            amount: transaction.amount,
            status: transaction.status,
            paymentStatus: transaction.paymentStatus,
            utr: transaction.utr
        }, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};
