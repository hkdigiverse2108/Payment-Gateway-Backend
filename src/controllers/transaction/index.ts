import { transactionModel, userModel, walletActivityModel } from '../../database';
import { HTTP_STATUS, resolveSortAndFilter, USER_ROLE, TRANSACTION_TYPE, ORDER_STATUS, PAYMENT_STATUS, WALLET_ACTIVITY_TYPE, GATEWAY } from '../../common';
import { reqInfo, responseMessage, getDataWithSorting, countData, getData, createData, getFirstMatch, redisGet, redisSet, redisDelPattern , creditUserWallet, clearTransactionCaches, apiResponse } from '../../helper';
import { getTransactionsSchema, createDepositSchema, getTransactionStatusSchema } from '../../validation';
import crypto from 'crypto';
import * as paymentService from '../../services';
import { redisClient } from '../../database/redis';
import { autoCreateTicketOnPaymentFailure } from '../../services/chatbotEngine';

export const getTransactions = async (req, res) => {
    reqInfo(req);
    try {        
        const { error, value } = getTransactionsSchema.validate(req.query || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const { criteria, options, page, limit } = resolveSortAndFilter(value, ['orderId', 'traId', 'utr', 'brand']);

        if (value.type) criteria.type = value.type;
        if (value.status) criteria.status = value.status;
        if (value.paymentStatus) criteria.paymentStatus = value.paymentStatus;
        if (req.user && req.user.role === USER_ROLE.USER) { criteria.userId = req.user._id; }

        const cacheUserKey = req.user && req.user.role === USER_ROLE.USER ? req.user._id.toString() : 'admin';
        const queryKey = Object.keys(value).sort().map((key) => `${key}=${JSON.stringify(value[key])}`).join('&') || 'none';
        const cacheKey = `transactions:list:${cacheUserKey}:${queryKey}`;

        const cachedResult = await redisGet(cacheKey);
        if (cachedResult) {
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Transactions"), cachedResult, {}));
        }

        const response = await getDataWithSorting(transactionModel, criteria, {}, options);
        const totalCount = await countData(transactionModel, criteria);
        const result = { data: response, totalData: totalCount, state: { page, limit, page_limit: Math.ceil(totalCount / limit) || 1 }};
        await redisSet(cacheKey, JSON.stringify(result), 300);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Transactions"), result, {}));
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
        if (req.user && req.user.role === USER_ROLE.USER) { criteria.userId = req.user._id; }

        const cacheUserKey = req.user && req.user.role === USER_ROLE.USER ? req.user._id.toString() : 'admin';
        const queryKey = Object.keys(value).sort().map((key) => `${key}=${JSON.stringify(value[key])}`).join('&') || 'none';
        const cacheKey = `transactions:export:${cacheUserKey}:${queryKey}`;

        const cachedCsv = await redisGet<{ csvContent: string }>(cacheKey);
        if (cachedCsv && cachedCsv.csvContent) {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
            return res.status(HTTP_STATUS.OK).send(cachedCsv.csvContent);
        }
        const data = await getData(transactionModel, criteria, {}, { sort: { createdAt: -1 } });
        if (data.length === 0) { return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, "No data found to export", {}, {})); }

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
        await redisSet(cacheKey, { csvContent }, 300);
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
    const user = (req as any).user;
    try {
        const { error, value } = createDepositSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const existing = await getFirstMatch(transactionModel, { userId: user._id, orderId: value.orderId });
        if (existing) { return res.status(HTTP_STATUS.CONFLICT).json(new apiResponse(HTTP_STATUS.CONFLICT, "Order ID already exists", {}, {})); }

        const traId = `DEP${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        let gatewayResponse: any;

        if (value.gateway === GATEWAY.CASHFREE) {
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
                    return_url: `${value.returnUrl}?order_id=${traId}`,
                    notify_url: value.notifyUrl || `${process.env.NGROK_BASE_URL}/transaction/webhook/cashfree`
                }
            });
        } else if (value.gateway === GATEWAY.RAZORPAY) {
            gatewayResponse = await paymentService.createRazorpayOrder({
                amount: value.amount,
                currency: "INR",
                receipt: traId,
            });
        } else if (value.gateway === GATEWAY.PAYU) {
            gatewayResponse = await paymentService.createPayUOrder({
                txnid: traId,
                amount: value.amount,
                firstname: value.customerName,
                email: value.customerEmail,
                phone: value.customerPhone,
                productinfo: "Wallet Deposit"
            });
        } else if (value.gateway === GATEWAY.PHONEPE) {
            gatewayResponse = await paymentService.createPhonePeOrder({
                amount: value.amount,
                orderId: traId,
                userId: user._id.toString()
            });
        } else if (value.gateway === GATEWAY.PAYTM) {
            gatewayResponse = await paymentService.createPaytmOrder({
                amount: value.amount,
                orderId: traId,
                userId: user._id.toString(),
                customerPhone: value.customerPhone,
                customerEmail: value.customerEmail
            });
        } else if (value.gateway === GATEWAY.STRIPE) {
            gatewayResponse = await paymentService.createStripeCheckoutSession({
                amount: value.amount,
                orderId: traId,
                userId: user._id.toString(),
                customerEmail: value.customerEmail,
                customerName: value.customerName,
                successUrl: `${value.returnUrl}?order_id=${traId}`,
                cancelUrl: `${value.returnUrl}?order_id=${traId}&status=failed`,
            });
        } else if (value.gateway === GATEWAY.CCAVENUE) {
            gatewayResponse = await paymentService.createCcavenueOrder({
                order_id: traId,
                amount: value.amount,
                customer_phone: value.customerPhone,
                customer_name: value.customerName,
                customer_email: value.customerEmail,
                redirect_url: `${process.env.BASE_URL}/transaction/webhook/ccavenue`,
                cancel_url: `${process.env.BASE_URL}/transaction/webhook/ccavenue`,
            });
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
        await redisDelPattern('transactions:list:*');
        await redisDelPattern('transactions:export:*');
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

        const cacheUserKey = req.user && req.user.role === USER_ROLE.USER ? req.user._id.toString() : 'admin';
        const cacheKey = `transaction_status:${cacheUserKey}:${value.orderId}`;
        const cachedStatus = await redisGet(cacheKey);

        if (cachedStatus) { return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Transaction status fetched", cachedStatus, {})); }

        const transaction = await getFirstMatch(transactionModel, { userId: req.user._id, orderId: value.orderId });
        if (!transaction) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, "Transaction not found", {}, {}));
        }

        const statusResult = {
            orderId: transaction.orderId,
            traId: transaction.traId,
            amount: transaction.amount,
            status: transaction.status,
            paymentStatus: transaction.paymentStatus,
            utr: transaction.utr
        };
        await redisSet(cacheKey, statusResult, 60);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Transaction status fetched", statusResult, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

// ====================== CashFree ==================================
export const cashfreeWebhook = async (req, res) => {
    reqInfo(req);
    console.log(req.body);
    try {
        const signature = req.headers['x-webhook-signature'] as string;
        const timestamp = req.headers['x-webhook-timestamp'] as string;
        const rawBodyBuffer = req.rawBody;
        const rawBodyStr = rawBodyBuffer ? rawBodyBuffer.toString('utf8') : '';
        
        if (!signature || !timestamp || !rawBodyStr) {
            console.error('Cashfree Webhook: Missing headers or body', { hasSignature: !!signature, hasTimestamp: !!timestamp, hasBody: !!rawBodyStr });
            return res.status(HTTP_STATUS.BAD_REQUEST).send('Missing headers or body');
        }

        const isVerified = paymentService.verifyCashfreeWebhookSignature(signature, rawBodyStr, timestamp);
        console.log("isVerified", isVerified);

        if (!isVerified) {
            console.error('Cashfree Webhook: Signature verification failed');
            return res.status(HTTP_STATUS.BAD_REQUEST).send('Invalid signature');
        }

        const webhookData = JSON.parse(rawBodyStr);
        const { data, type } = webhookData;
        const orderId = data.order?.order_id;
        const paymentStatus = data.payment?.payment_status ? data.payment.payment_status.toUpperCase() : '';

        console.log(`Cashfree Webhook received for Order ID: ${orderId}, Type: ${type}, Status: ${paymentStatus}`);

        const lockKey = `cashfree:webhook:${orderId}`;
        const isFirst = await redisClient.set(lockKey, "1", { NX: true, EX: 300 });
        if (isFirst !== "OK") { return res.status(HTTP_STATUS.OK).send("Duplicate webhook ignored"); }

        const transaction = await transactionModel.findOne({ traId: orderId });
        if (!transaction) {
            console.error(`Cashfree Webhook: Transaction not found for orderId ${orderId}`);
            return res.status(HTTP_STATUS.NOT_FOUND).send('Transaction not found');
        }

        if (transaction.status !== ORDER_STATUS.PENDING) {
            console.log(`Cashfree Webhook: Transaction ${orderId} already processed with status ${transaction.status}`);
            return res.status(HTTP_STATUS.OK).send('Already processed');
        }

        if (paymentStatus === "SUCCESS") {
            transaction.status = ORDER_STATUS.SUCCESS;
            transaction.paymentStatus = PAYMENT_STATUS.SUCCESS;
            transaction.utr = data.payment?.bank_reference;
            await transaction.save();

             await creditUserWallet({
                userId: transaction.userId,
                transactionId: transaction._id,
                amount: transaction.amount,
                orderId: transaction.orderId,
                brand: transaction.brand
            });
        } else if (paymentStatus === "FAILED" || paymentStatus === "CANCELLED" || type === "USER_DROPPED_WEBHOOK") {
            transaction.status = ORDER_STATUS.FAILED;
            transaction.paymentStatus = PAYMENT_STATUS.FAILED;    
            await transaction.save();
            // Auto-create support ticket on payment failure
            await autoCreateTicketOnPaymentFailure(transaction);
        }
        await clearTransactionCaches(transaction.orderId);
        return res.status(HTTP_STATUS.OK).send('Webhook processed');
    } catch (error) {
        console.error('Cashfree Webhook Error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Internal Server Error');
    }
};

// ====================== Razorpay ==================================
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

        const lockKey = `razorpay:webhook:${traId}`;
        const isFirst = await redisClient.set(lockKey, "1", { NX: true, EX: 300 });
        if (isFirst !== "OK") { return res.status(HTTP_STATUS.OK).send("Duplicate webhook ignored"); }

        const transaction = await transactionModel.findOne({ traId });
        if (!transaction) {
            console.error(`Razorpay Webhook: Transaction not found for traId ${traId}`);
            return res.status(HTTP_STATUS.NOT_FOUND).send('Transaction not found');
        }

        if (transaction.status !== ORDER_STATUS.PENDING) { return res.status(HTTP_STATUS.OK).send('Already processed'); }

        if (paymentStatus === "captured") {
            transaction.status = ORDER_STATUS.SUCCESS;
            transaction.paymentStatus = PAYMENT_STATUS.SUCCESS;
            transaction.utr = payment.acquirer_data?.bank_transaction_id || payment.id;
            await transaction.save();

            await creditUserWallet({
                userId: transaction.userId,
                transactionId: transaction._id,
                amount: transaction.amount,
                orderId: transaction.orderId,
                brand: transaction.brand
            });
        } else if (paymentStatus === PAYMENT_STATUS.FAILED || paymentStatus === PAYMENT_STATUS.CANCELLED) {
            transaction.status = ORDER_STATUS.FAILED;
            transaction.paymentStatus = PAYMENT_STATUS.FAILED;
            await transaction.save();
            // Auto-create support ticket on payment failure
            await autoCreateTicketOnPaymentFailure(transaction);
        }
        await clearTransactionCaches(transaction.orderId);
        return res.status(HTTP_STATUS.OK).send('Webhook processed');
    } catch (error) {
        console.error('Razorpay Webhook Error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Internal Server Error');
    }
};

// just check razorpay payment successfull or not [Live use Webhook key and webhook URL] , after delete this
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
        await creditUserWallet({
            userId: transaction.userId,
            transactionId: transaction._id,
            amount: transaction.amount,
            orderId: transaction.orderId,
            brand: transaction.brand
        });
        await clearTransactionCaches(transaction.orderId);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Payment verified successfully", { transaction }, {}));
    } catch (error) {
        console.error('Razorpay Verify Error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, "Internal Server Error", {}, {}));
    }
};

// ====================== PayU ==================================
export const payuWebhook = async (req, res) => {
    reqInfo(req);
    try {
        const payuResponse = req.body;
        const isVerified = paymentService.verifyPayUHash(payuResponse);
        if (!isVerified) { return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, "Invalid PayU hash", {}, {})); }

        const lockKey = `payu:webhook:${payuResponse.txnid}`;
        const isFirst = await redisClient.set(lockKey, "1", { NX: true, EX: 300 });
        if (isFirst !== "OK") { return res.status(HTTP_STATUS.OK).send("Duplicate webhook ignored"); }

        const transaction = await transactionModel.findOne({ traId: payuResponse.txnid });
        if (!transaction) {
            return res.status(HTTP_STATUS.NOT_FOUND).json(
                new apiResponse(HTTP_STATUS.NOT_FOUND, "Transaction not found", {}, {})
            );
        }

        if (transaction.status !== ORDER_STATUS.PENDING) {
            return res.status(HTTP_STATUS.OK).json(
                new apiResponse(HTTP_STATUS.OK, "Already processed", {}, {})
            );
        }

        if (payuResponse.status === "success") {
            transaction.status = ORDER_STATUS.SUCCESS;
            transaction.paymentStatus = PAYMENT_STATUS.SUCCESS;
            transaction.utr = payuResponse.mihpayid;
            await transaction.save();

            await creditUserWallet({
                userId: transaction.userId,
                transactionId: transaction._id,
                amount: transaction.amount,
                orderId: transaction.orderId,
                brand: transaction.brand
            });
        } else {
            transaction.status = ORDER_STATUS.FAILED;
            transaction.paymentStatus = PAYMENT_STATUS.FAILED;
            await transaction.save();
            // Auto-create support ticket on payment failure
            await autoCreateTicketOnPaymentFailure(transaction);
        }
        await clearTransactionCaches(transaction.orderId);
        return res.status(HTTP_STATUS.OK).send("PayU webhook processed");
    } catch (error) {
        console.error("PayU Webhook Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send("Internal Server Error");
    }
};

// ====================== PhonePe ==================================
export const phonePeWebhook = async (req, res) => {
    reqInfo(req);
    try {
        const signature = req.headers['x-verify-signature'] as string;
        const rawBody = (req as any).rawBody.toString();

        if (!signature || !rawBody) {
            console.error('PhonePe Webhook: Missing headers or body');
            return res.status(HTTP_STATUS.BAD_REQUEST).send('Missing headers or body');
        }

        const isVerified = paymentService.verifyPhonePeWebhookSignature(signature, rawBody);
        if (!isVerified) {
            console.error('PhonePe Webhook: Signature verification failed');
            return res.status(HTTP_STATUS.BAD_REQUEST).send('Invalid signature');
        }

        let data;
        if (req.body.response) {
            const decodedBody = Buffer.from(req.body.response, 'base64').toString('utf-8');
            data = JSON.parse(decodedBody);
        } else {
            data = JSON.parse(rawBody);
        }

        const payloadData = data.data || data;
        const merchantTransactionId = payloadData.merchantTransactionId;
        const state = payloadData.state || payloadData.status; // state in SDK v2, status in older
        const paymentInstrumentId = payloadData.paymentInstrument?.pgTransactionId;

        const lockKey = `phonepe:webhook:${merchantTransactionId}`;
        const isFirst = await redisClient.set(lockKey, "1", { NX: true, EX: 300 });
        if (isFirst !== "OK") { return res.status(HTTP_STATUS.OK).send("Duplicate webhook ignored"); }

        const transaction = await transactionModel.findOne({ 'metadata.merchantTransactionId': merchantTransactionId, });

        if (!transaction) {
            console.error(`PhonePe Webhook: Transaction not found for ${merchantTransactionId}`);
            return res.status(HTTP_STATUS.NOT_FOUND).send('Transaction not found');
        }

        if (transaction.status !== ORDER_STATUS.PENDING) {
            return res.status(HTTP_STATUS.OK).send('Already processed');
        }

        if (state === "COMPLETED" || state === "SUCCESS") {
            transaction.status = ORDER_STATUS.SUCCESS;
            transaction.paymentStatus = PAYMENT_STATUS.SUCCESS;
            transaction.utr = paymentInstrumentId || 'phonepe-utr';
            await transaction.save();

            await creditUserWallet({
                userId: transaction.userId,
                transactionId: transaction._id,
                amount: transaction.amount,
                orderId: transaction.orderId,
                brand: transaction.brand
             });
        } else if (state === "FAILED") {
            transaction.status = ORDER_STATUS.FAILED;
            transaction.paymentStatus = PAYMENT_STATUS.FAILED;
            await transaction.save();
            // Auto-create support ticket on payment failure
            await autoCreateTicketOnPaymentFailure(transaction);
        }
        await clearTransactionCaches(transaction.orderId);
        return res.status(HTTP_STATUS.OK).send('Webhook processed');
    } catch (error) {
        console.error('PhonePe Webhook Error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Internal Server Error');
    }
};

// just check payment successfull or not , after delete this and set webhook in dashboard
export const verifyPhonePePayment = async (req, res) => {
    reqInfo(req);
    try {
        const { merchantTransactionId, transactionId } = req.body;
        if (!merchantTransactionId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, 'Missing merchantTransactionId', {}, {}));
        }

        const transaction = await transactionModel.findOne({ 'metadata.merchantTransactionId': merchantTransactionId, });
        if (!transaction) {
            console.error(`PhonePe Verify: Transaction not found for ${merchantTransactionId}`);
            return res.status(HTTP_STATUS.NOT_FOUND).send('Transaction not found');
        }

        if (transaction.status === ORDER_STATUS.SUCCESS) {
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, 'Payment already verified', { transaction }, {}));
        }
        const statusResponse = await paymentService.getPhonePeOrderStatus(merchantTransactionId);
        
        console.log("PhonePe Status Response: ", JSON.stringify(statusResponse));
        const state = statusResponse.state || (statusResponse as any).status;

        if (state === 'COMPLETED' || state === 'SUCCESS') {
            transaction.status = ORDER_STATUS.SUCCESS;
            transaction.paymentStatus = PAYMENT_STATUS.SUCCESS;

            let utr = transactionId || statusResponse.orderId;
            if (statusResponse.paymentDetails && statusResponse.paymentDetails.length > 0) {
                const detail: any = statusResponse.paymentDetails[0];
                utr = detail.pgTransactionId || utr;
            }

            transaction.utr = utr;
            await transaction.save();

            await creditUserWallet({
                userId: transaction.userId,
                transactionId: transaction._id,
                amount: transaction.amount,
                orderId: transaction.orderId,
                brand: transaction.brand
            });
            await clearTransactionCaches(transaction.orderId);
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, 'PhonePe payment verified successfully', { transaction }, {}));
        } else if (state === 'FAILED') {
            transaction.status = ORDER_STATUS.FAILED;
            transaction.paymentStatus = PAYMENT_STATUS.FAILED;
            await transaction.save();
            await autoCreateTicketOnPaymentFailure(transaction);
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, 'Payment failed at PhonePe', { transaction }, {}));
        } else {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, `Payment is still ${state}`, { transaction }, {}));
        }
    } catch (error) {
        console.error('Phonepe Verify Error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Internal Server Error', {}, {}));
    }
}

// ====================== Paytm ==================================
export const paytmWebhook = async (req, res) => {
    reqInfo(req);
    try {
        const paytmResponse = req.body;
        const isVerified = paymentService.verifyPaytmPaymentSignature(paytmResponse);
        if (!isVerified) {
            console.error('Paytm Webhook: Signature verification failed');
            return res.status(HTTP_STATUS.BAD_REQUEST).send('Invalid signature');
        }

        const merchantTransactionId = paytmResponse.ORDERID || paytmResponse.body?.orderId;
        const status = paytmResponse.STATUS || paytmResponse.body?.resultInfo?.resultStatus;
        const txnId = paytmResponse.TXNID || paytmResponse.txnId;

        const lockKey = `paytm:webhook:${merchantTransactionId}`;
        const isFirst = await redisClient.set(lockKey, "1", { NX: true, EX: 300 });
        if (isFirst !== "OK") { return res.status(HTTP_STATUS.OK).send("Duplicate webhook ignored"); }

        const transaction = await transactionModel.findOne({ 'metadata.merchantTransactionId': merchantTransactionId });
        if (!transaction) {
            console.error(`Paytm Webhook: Transaction not found for ${merchantTransactionId}`);
            return res.status(HTTP_STATUS.NOT_FOUND).send('Transaction not found');
        }

        if (transaction.status !== ORDER_STATUS.PENDING) {
            return res.status(HTTP_STATUS.OK).send('Already processed');
        }

        if (status === "TXN_SUCCESS") {
            transaction.status = ORDER_STATUS.SUCCESS;
            transaction.paymentStatus = PAYMENT_STATUS.SUCCESS;
            transaction.utr = txnId;
            await transaction.save();

            await creditUserWallet({
                userId: transaction.userId,
                transactionId: transaction._id,
                amount: transaction.amount,
                orderId: transaction.orderId,
                brand: transaction.brand
            });
        } else if (status === "TXN_FAILURE" || status === "FAILED") {
            transaction.status = ORDER_STATUS.FAILED;
            transaction.paymentStatus = PAYMENT_STATUS.FAILED;
            await transaction.save();
            // Auto-create support ticket on payment failure
            await autoCreateTicketOnPaymentFailure(transaction);
        }
        await clearTransactionCaches(transaction.orderId);
        return res.status(HTTP_STATUS.OK).send('Webhook processed');
    } catch (error) {
        console.error('Paytm Webhook Error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Internal Server Error');
    }
};

// just check payment successfull or not , after delete this and set webhook in dashboard
export const verifyPaytmPayment = async (req, res) => {
    reqInfo(req);
    try {
        const { merchantTransactionId } = req.body;
        if (!merchantTransactionId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, 'Missing merchantTransactionId', {}, {}));
        }
        const transaction = await transactionModel.findOne({ 'metadata.merchantTransactionId': merchantTransactionId, });
        if (!transaction) {
            console.error(`Paytm Verify: Transaction not found for ${merchantTransactionId}`);
            return res.status(HTTP_STATUS.NOT_FOUND).send('Transaction not found');
        }

        if (transaction.status === ORDER_STATUS.SUCCESS) {
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, 'Payment already verified', { transaction }, {}));
        }

        const statusResponse = await paymentService.getPaytmOrderStatus(merchantTransactionId);

        if (statusResponse.resultInfo && statusResponse.resultInfo.resultStatus === 'TXN_SUCCESS') {
            transaction.status = ORDER_STATUS.SUCCESS;
            transaction.paymentStatus = PAYMENT_STATUS.SUCCESS;
            transaction.utr = statusResponse.txnId || 'paytm-txn';
            await transaction.save();

            await creditUserWallet({
                userId: transaction.userId,
                transactionId: transaction._id,
                amount: transaction.amount,
                orderId: transaction.orderId,
                brand: transaction.brand
            });
            await clearTransactionCaches(transaction.orderId);
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, 'Paytm payment verified successfully', { transaction }, {}));
        } else if (statusResponse.resultInfo && statusResponse.resultInfo.resultStatus === 'TXN_FAILURE') {
            transaction.status = ORDER_STATUS.FAILED;
            transaction.paymentStatus = PAYMENT_STATUS.FAILED;
            await transaction.save();
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, 'Payment failed at Paytm', { transaction }, {}));
        } else {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, `Payment is still ${statusResponse.resultInfo?.resultStatus || 'PENDING'}`, { transaction }, {}));
        }
    } catch (error) {
        console.error('Paytm Verify Error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Internal Server Error', {}, {}));
    }
};

// ===================== Stripe ==========================================
export const stripeWebhook = async (req, res) => {
    reqInfo(req);
    try {
        const signature = req.headers['stripe-signature'] as string;
        if (!signature) { return res.status(HTTP_STATUS.BAD_REQUEST).send('Missing stripe signature'); }
        const event = paymentService.verifyStripeWebhookSignature(signature, req.rawBody);
        console.log(`Stripe webhook received: ${event.type}`);

        if (event.type === 'checkout.session.completed') {
            const session: any = event.data.object;
            const traId = session.metadata?.orderId;

            if (!traId) {
                return res.status(HTTP_STATUS.BAD_REQUEST).send('Missing orderId metadata');
            }

            const lockKey = `stripe:webhook:${traId}`;
            const isFirst = await redisClient.set(lockKey, "1", { NX: true, EX: 300 });
            if (isFirst !== "OK") {return res.status(HTTP_STATUS.OK).send("Duplicate webhook ignored");}

            const transaction = await transactionModel.findOne({ traId });
            if (!transaction) {
                console.error(`Stripe transaction not found: ${traId}`);
                return res.status(HTTP_STATUS.NOT_FOUND).send('Transaction not found');
            }

            if (transaction.status !== ORDER_STATUS.PENDING) {
                console.log(`Stripe transaction already processed: ${traId}`);
                return res.status(HTTP_STATUS.OK).send('Already processed');
            }

            const stripeAmount = Number(session.amount_total) / 100;
            if (stripeAmount !== transaction.amount) {
                console.error(`Stripe amount mismatch. Expected ${transaction.amount}, got ${stripeAmount}`);
                return res.status(HTTP_STATUS.BAD_REQUEST).send('Amount mismatch');
            }

            const updatedTransaction = await transactionModel.findOneAndUpdate(
                { _id: transaction._id, status: ORDER_STATUS.PENDING },
                { status: ORDER_STATUS.SUCCESS, paymentStatus: PAYMENT_STATUS.SUCCESS, utr: session.payment_intent || session.id, $set: { stripeEventId: event.id } },
                { new: true }
            );

            if (!updatedTransaction) {
                return res.status(HTTP_STATUS.OK).send('Already updated');
            }
            await creditUserWallet({
                userId: transaction.userId,
                transactionId: transaction._id,
                amount: transaction.amount,
                orderId: transaction.orderId,
                brand: transaction.brand
            });
            await clearTransactionCaches(transaction.orderId);
            return res.status(HTTP_STATUS.OK).send('Webhook processed successfully');
        } 
        
        if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
            const session: any = event.data.object;
            const traId = session.metadata?.orderId;
            if (traId) {
                const failedTransaction = await transactionModel.findOneAndUpdate(
                    { traId, status: ORDER_STATUS.PENDING },
                    { status: ORDER_STATUS.FAILED, paymentStatus: PAYMENT_STATUS.FAILED, $set: { stripeEventId: event.id } },
                    { new: true }
                );
                console.log(`Stripe payment failed: ${traId}`);
                if (failedTransaction) await autoCreateTicketOnPaymentFailure(failedTransaction);
                await clearTransactionCaches(traId);
            }
            return res.status(HTTP_STATUS.OK).send('Webhook processed');
        }
        
        return res.status(HTTP_STATUS.OK).send('Unhandled event type');
    } catch (error: any) {
        console.error('Stripe Webhook Error:', error.message);
        return res.status(HTTP_STATUS.BAD_REQUEST).send(`Webhook Error: ${error.message}`);
    }
};

// ====================== CCAvenue ==================================
export const ccavenueWebhook = async (req, res) => {
    reqInfo(req);
    try {
        const { encResp } = req.body;
        if (!encResp) {
            console.error('CCAvenue Webhook: Missing encResp in body');
            return res.status(HTTP_STATUS.BAD_REQUEST).send('Missing encrypted response');
        }

        const workingKey = process.env.CCAVENUE_WORKING_KEY || '';
        if (!workingKey) {
            console.error('CCAvenue Webhook: CCAVENUE_WORKING_KEY is not defined');
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Server configuration error');
        }

        // Decrypt the response from CCAvenue
        const decrypted = paymentService.decrypt(encResp, workingKey);
        console.log('CCAvenue Decrypted Webhook Response:', decrypted);

        const decryptedParams = new URLSearchParams(decrypted);
        const orderId = decryptedParams.get('order_id');
        const orderStatus = decryptedParams.get('order_status');
        const trackingId = decryptedParams.get('tracking_id');

        if (!orderId) {
            console.error('CCAvenue Webhook: Missing order_id in decrypted payload');
            return res.status(HTTP_STATUS.BAD_REQUEST).send('Invalid response payload');
        }

        const lockKey = `ccavenue:webhook:${orderId}`;
        const isFirst = await redisClient.set(lockKey, "1", { NX: true, EX: 300 });
        if (isFirst !== "OK") { const returnUrl = (await transactionModel.findOne({ traId: orderId }))?.metadata?.returnUrl;
            
        if (returnUrl) { return res.redirect(`${returnUrl}?order_id=${orderId}&status=duplicate`); }
            return res.status(HTTP_STATUS.OK).send('Duplicate webhook ignored');
        }

        const transaction = await transactionModel.findOne({ traId: orderId });
        if (!transaction) {
            console.error(`CCAvenue Webhook: Transaction not found for traId ${orderId}`);
            return res.status(HTTP_STATUS.NOT_FOUND).send('Transaction not found');
        }

        if (transaction.status !== ORDER_STATUS.PENDING) {
            console.log(`CCAvenue Webhook: Transaction ${orderId} already processed with status ${transaction.status}`);
            const returnUrl = transaction.metadata?.returnUrl;
            if (returnUrl) {
                await clearTransactionCaches(transaction.orderId);
                return res.redirect(`${returnUrl}?order_id=${transaction.orderId}&status=${transaction.status}`);
            }
            return res.status(HTTP_STATUS.OK).send('Already processed');
        }

        const responseAmount = Number(decryptedParams.get('amount'));
        if (responseAmount !== transaction.amount) {
            return res.status(HTTP_STATUS.BAD_REQUEST).send('Amount mismatch');
        }

        if (orderStatus === 'Success') {
            transaction.status = ORDER_STATUS.SUCCESS;
            transaction.paymentStatus = PAYMENT_STATUS.SUCCESS;
            transaction.utr = trackingId || 'ccavenue-utr';
            await transaction.save();

            await creditUserWallet({
                userId: transaction.userId,
                transactionId: transaction._id,
                amount: transaction.amount,
                orderId: transaction.orderId,
                brand: transaction.brand
            });
            console.log(`CCAvenue Payment SUCCESS for Transaction ID: ${transaction.traId}`);
            await clearTransactionCaches(transaction.orderId);
        } else {
            transaction.status = ORDER_STATUS.FAILED;
            transaction.paymentStatus = PAYMENT_STATUS.FAILED;
            await transaction.save();
            console.log(`CCAvenue Payment FAILED/CANCELLED for Transaction ID: ${transaction.traId}. Status was: ${orderStatus}`);
            // Auto-create support ticket on payment failure
            await autoCreateTicketOnPaymentFailure(transaction);
            await clearTransactionCaches(transaction.orderId);
        }

        const returnUrl = transaction.metadata?.returnUrl;
        if (returnUrl) { return res.redirect(`${returnUrl}?order_id=${transaction.orderId}&status=${transaction.status}`); }

        return res.status(HTTP_STATUS.OK).json(
            new apiResponse( HTTP_STATUS.OK, `Payment processed with status: ${transaction.status}`,
                {
                    orderId: transaction.orderId,
                    traId: transaction.traId,
                    status: transaction.status,
                    paymentStatus: transaction.paymentStatus
                },
                {}
            )
        );
    } catch (error: any) {
        console.error('CCAvenue Webhook Error:', error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Internal Server Error');
    }
};

// Dev-only Mock helper to decrypt encRequest for browser testing [live -- remove]
export const ccavenueMockDecrypt = async (req, res) => {
    try {
        const { encRequest } = req.body;
        if (!encRequest) return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: "Missing encRequest" });
        
        const workingKey = process.env.CCAVENUE_WORKING_KEY || '';
        if (!workingKey) return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: "Missing Working Key in env" });
        const hash = crypto.createHash('sha256').update(encRequest).digest('hex');
        const cacheKey = `ccavenue:mock:decrypt:${hash}`;

        const cached = await redisGet(cacheKey);
        if (cached) return res.status(HTTP_STATUS.OK).json(cached);

        const decrypted = paymentService.decrypt(encRequest, workingKey);
        
        const params = new URLSearchParams(decrypted);
        const order_id = params.get('order_id');
        const amount = params.get('amount');

        const result = { order_id, amount };
        await redisSet(cacheKey, result, 300);
        return res.status(HTTP_STATUS.OK).json(result);
    } catch (error: any) {
        console.error("Mock Decrypt Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: error.message });
    }
};

// Dev-only Mock helper to encrypt parameters into encResp for browser testing [live -- remove]
export const ccavenueMockEncrypt = async (req, res) => {
    try {
        const { order_id, amount, order_status } = req.body;
        const workingKey = process.env.CCAVENUE_WORKING_KEY || '';
        if (!workingKey) return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ message: "Missing Working Key in env" });
        
        const trackingId = `MOCK_CCAV_${Date.now()}`;
        const plainParams = `order_id=${order_id}&order_status=${order_status}&amount=${amount}&tracking_id=${trackingId}&bank_ref_no=BANK_${Date.now()}&payment_mode=UPI`;

        const hash = crypto.createHash('sha256').update(plainParams).digest('hex');
        const cacheKey = `ccavenue:mock:encrypt:${hash}`;

        const cached = await redisGet(cacheKey);
        if (cached && cached.encResp) return res.status(HTTP_STATUS.OK).json(cached);

        const encResp = paymentService.encrypt(plainParams, workingKey);
        await redisSet(cacheKey, { encResp }, 300);
        return res.status(HTTP_STATUS.OK).json({ encResp });
    } catch (error: any) {
        console.error("Mock Encrypt Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: error.message });
    }
};