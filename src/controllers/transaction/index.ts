import { transactionModel, userModel, walletActivityModel } from '../../database';
import { apiResponse, HTTP_STATUS, resolveSortAndFilter, USER_ROLE, TRANSACTION_TYPE, ORDER_STATUS, PAYMENT_STATUS, WALLET_ACTIVITY_TYPE } from '../../common';
import { reqInfo, responseMessage, getDataWithSorting, countData, getData, createData, getFirstMatch } from '../../helper';
import { getTransactionsSchema, createDepositSchema, getTransactionStatusSchema } from '../../validation';
import crypto from 'crypto';
import * as paymentService from '../../services';

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
    const { user } = req;
    
    // TEMPORARY Testing : Fallback to any admin for testing if no auth middleware
    // let user = (req as any).user;
    // if (!user) {
    //     user = await userModel.findOne({ role: 'admin' });
    // }

    try {
        const { error, value } = createDepositSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const existing = await getFirstMatch(transactionModel, { userId: user._id, orderId: value.orderId });
        if (existing) {
            return res.status(HTTP_STATUS.CONFLICT).json(new apiResponse(HTTP_STATUS.CONFLICT, "Order ID already exists", {}, {}));
        }

        const traId = `DEP${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        let gatewayResponse: any;

        if (value.gateway === 'cashfree') {
            gatewayResponse = await paymentService.createCashfreeOrder({
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
        } else if (value.gateway === 'razorpay') {
            gatewayResponse = await paymentService.createRazorpayOrder({
                amount: value.amount,
                currency: "INR",
                receipt: traId,
            });
        } else if (value.gateway === 'paytm' || value.gateway === 'payu' || value.gateway === 'phonepe') {
            return res.status(HTTP_STATUS.NOT_IMPLEMENTED).json(new apiResponse(HTTP_STATUS.NOT_IMPLEMENTED, `${value.gateway} not implemented yet`, {}, {}));
        } else {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, "Invalid gateway", {}, {}));
        }

        const transaction = await createData(transactionModel, {
            userId: user._id,
            orderId: value.orderId,
            traId,
            type: TRANSACTION_TYPE.DEPOSIT,
            gateway: value.gateway,
            amount: value.amount,
            status: ORDER_STATUS.PENDING,
            paymentStatus: PAYMENT_STATUS.PENDING,
            metadata: {
                ...gatewayResponse,
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
            gateway: transaction.gateway,
            paymentSession: gatewayResponse
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

export const cashfreeWebhook = async (req, res) => {
    reqInfo(req);
    try {
        const signature = req.headers['x-webhook-signature'];
        const timestamp = req.headers['x-webhook-timestamp'];
        const rawBody = req.rawBody;

        if (!signature || !timestamp || !rawBody) {
            console.error('Cashfree Webhook: Missing headers or body');
            return res.status(HTTP_STATUS.BAD_REQUEST).send('Missing headers or body');
        }

        const isVerified = paymentService.verifyCashfreeWebhookSignature(signature, rawBody, timestamp);
        console.log("isVerified", isVerified);

        if (!isVerified) {
            console.error('Cashfree Webhook: Signature verification failed');
            return res.status(HTTP_STATUS.BAD_REQUEST).send('Invalid signature');
        }

        const webhookData = JSON.parse(rawBody);
        const { data } = webhookData;
        const orderId = data.order.order_id;
        const paymentStatus = data.payment.payment_status;

        console.log(`Cashfree Webhook received for Order ID: ${orderId}, Status: ${paymentStatus}`);

        const transaction = await transactionModel.findOne({ traId: orderId });
        if (!transaction) {
            console.error(`Cashfree Webhook: Transaction not found for orderId ${orderId}`);
            return res.status(HTTP_STATUS.NOT_FOUND).send('Transaction not found');
        }

        if (transaction.status !== ORDER_STATUS.PENDING) {
            console.log(`Cashfree Webhook: Transaction ${orderId} already processed with status ${transaction.status}`);
            return res.status(HTTP_STATUS.OK).send('Already processed');
        }

        if (paymentStatus === 'SUCCESS') {
            transaction.status = ORDER_STATUS.SUCCESS;
            transaction.paymentStatus = PAYMENT_STATUS.SUCCESS;
            transaction.utr = data.payment.bank_reference;
            await transaction.save();

            const user = await userModel.findOne({ _id: transaction.userId });
            if (user) {
                const previousBalance = user.walletBalance || 0;
                user.walletBalance = previousBalance + transaction.amount;
                await user.save();

                await createData(walletActivityModel, {
                    userId: user._id,
                    transactionId: transaction._id,
                    type: WALLET_ACTIVITY_TYPE.CREDIT,
                    amount: transaction.amount,
                    previousBalance: previousBalance,
                    newBalance: user.walletBalance,
                    description: `Wallet credited for deposit ${transaction.orderId}`,
                    brand: transaction.brand
                });
            }
        } else if (paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
            transaction.status = ORDER_STATUS.FAILED;
            transaction.paymentStatus = PAYMENT_STATUS.FAILED;
            await transaction.save();
        }
        return res.status(HTTP_STATUS.OK).send('Webhook processed');
    } catch (error) {
        console.error('Cashfree Webhook Error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Internal Server Error');
    }
};

export const razorpayWebhook = async (req, res) => {
    reqInfo(req);
    try {
        const signature = req.headers['x-razorpay-signature'] as string;
        const rawBody = req.rawBody;
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';

        if (!signature || !rawBody) {
            console.error('Razorpay Webhook: Missing headers or body');
            return res.status(HTTP_STATUS.BAD_REQUEST).send('Missing headers or body');
        }

        const isVerified = paymentService.verifyRazorpayWebhookSignature(signature, rawBody, webhookSecret);

        if (!isVerified) {
            console.error('Razorpay Webhook: Signature verification failed');
            return res.status(HTTP_STATUS.BAD_REQUEST).send('Invalid signature');
        }

        const webhookData = JSON.parse(rawBody);
        const { payload } = webhookData;
        
        const payment = payload.payment.entity;
        const order = payload.order?.entity;
        
        const traId = payment.notes?.receipt || payment.receipt || order?.receipt;
        const paymentStatus = payment.status; // captured, failed

        if (!traId) {
            console.error('Razorpay Webhook: No receipt (traId) found in payload');
            return res.status(HTTP_STATUS.BAD_REQUEST).send('No traId found');
        }

        const transaction = await transactionModel.findOne({ traId });
        if (!transaction) {
            console.error(`Razorpay Webhook: Transaction not found for traId ${traId}`);
            return res.status(HTTP_STATUS.NOT_FOUND).send('Transaction not found');
        }

        if (transaction.status !== ORDER_STATUS.PENDING) {
            return res.status(HTTP_STATUS.OK).send('Already processed');
        }

        if (paymentStatus === 'captured') {
            transaction.status = ORDER_STATUS.SUCCESS;
            transaction.paymentStatus = PAYMENT_STATUS.SUCCESS;
            transaction.utr = payment.acquirer_data?.bank_transaction_id || payment.id;
            await transaction.save();

            const user = await userModel.findOne({ _id: transaction.userId });
            if (user) {
                const previousBalance = user.walletBalance || 0;
                user.walletBalance = previousBalance + transaction.amount;
                await user.save();

                await createData(walletActivityModel, {
                    userId: user._id,
                    transactionId: transaction._id,
                    type: WALLET_ACTIVITY_TYPE.CREDIT,
                    amount: transaction.amount,
                    previousBalance: previousBalance,
                    newBalance: user.walletBalance,
                    description: `Wallet credited for Razorpay deposit ${transaction.orderId}`,
                    brand: transaction.brand
                });
            }
        } else if (paymentStatus === 'failed') {
            transaction.status = ORDER_STATUS.FAILED;
            transaction.paymentStatus = PAYMENT_STATUS.FAILED;
            await transaction.save();
        }
        return res.status(HTTP_STATUS.OK).send('Webhook processed');
    } catch (error) {
        console.error('Razorpay Webhook Error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Internal Server Error');
    }
};

// just check pyment successfull or not , after delete this
export const verifyRazorpayPayment = async (req, res) => {
    reqInfo(req);
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, "Missing payment details", {}, {}));
        }

        const isVerified = paymentService.verifyRazorpayPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);

        if (!isVerified) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, "Signature verification failed", {}, {}));
        }

        const transaction = await transactionModel.findOne({ 'metadata.id': razorpay_order_id });
        if (!transaction) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, "Transaction not found", {}, {}));
        }

        if (transaction.status === ORDER_STATUS.SUCCESS) {
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Payment already verified", { transaction }, {}));
        }

        transaction.status = ORDER_STATUS.SUCCESS;
        transaction.paymentStatus = PAYMENT_STATUS.SUCCESS;
        transaction.utr = razorpay_payment_id;
        await transaction.save();

        const user = await userModel.findOne({ _id: transaction.userId });
        if (user) {
            const previousBalance = user.walletBalance || 0;
            user.walletBalance = previousBalance + transaction.amount;
            await user.save();

            await createData(walletActivityModel, {
                userId: user._id,
                transactionId: transaction._id,
                type: WALLET_ACTIVITY_TYPE.CREDIT,
                amount: transaction.amount,
                previousBalance: previousBalance,
                newBalance: user.walletBalance,
                description: `Wallet credited for Razorpay deposit ${transaction.orderId}`,
                brand: transaction.brand
            });
        }

        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Payment verified successfully", { transaction }, {}));
    } catch (error) {
        console.error('Razorpay Verify Error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, "Internal Server Error", {}, {}));
    }
};
