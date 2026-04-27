import { transactionModel, walletActivityModel, userModel, bulkUploadModel } from '../../database';
import { apiResponse, HTTP_STATUS, TRANSACTION_TYPE, WALLET_ACTIVITY_TYPE, ORDER_STATUS, PAYMENT_STATUS, BULK_UPLOAD_STATUS } from '../../common';
import { reqInfo, responseMessage, createData, getFirstMatch, updateData, getData } from '../../helper';
import crypto from 'crypto';
import { manualWithdrawSchema, quickPasteWithdrawSchema } from '../../validation';

export const manualWithdraw = async (req, res) => {
    reqInfo(req);
    try {
        const { error, value } = manualWithdrawSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const { amount, bankName, accountNumber, ifscCode, accountHolderName, branch } = value;

        // Check balance
        const user = await getFirstMatch(userModel, { _id: req.user._id });
        if (!user || user.walletBalance < amount) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, "Insufficient wallet balance", {}, {}));
        }

        const orderId = `WD${Date.now()}${crypto.randomInt(1000, 9999)}`;
        const traId = `TRA${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

        const transaction = await createData(transactionModel, {
            userId: req.user._id,
            orderId,
            traId,
            type: TRANSACTION_TYPE.WITHDRAW,
            amount,
            status: ORDER_STATUS.PENDING,
            paymentStatus: PAYMENT_STATUS.PENDING,
            accountDetails: { bankName, accountNumber, ifscCode, accountHolderName, branch }
        });

        // Debit Wallet
        const previousBalance = user.walletBalance;
        const newBalance = previousBalance - amount;
        await updateData(userModel, { _id: req.user._id }, { walletBalance: newBalance });

        // Create Wallet Activity
        await createData(walletActivityModel, {
            userId: req.user._id,
            transactionId: transaction._id,
            type: WALLET_ACTIVITY_TYPE.DEBIT,
            amount,
            previousBalance,
            newBalance,
            description: `Manual Withdrawal Request - ${orderId}`
        });

        return res.status(HTTP_STATUS.CREATED).json(new apiResponse(HTTP_STATUS.CREATED, "Withdrawal request submitted successfully", transaction, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const quickPasteWithdraw = async (req, res) => {
    reqInfo(req);
    try {
        const { error, value } = quickPasteWithdrawSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const { pasteData } = value;

        const lines = pasteData.split('\n').filter(l => l.trim());
        const results: any[] = [];

        // Basic parser: assumes comma or tab separated values in order: 
        // Holder Name, Amount, Account Number, IFSC, Bank Name
        for (const line of lines) {
            const parts = line.split(/[,\t]/).map(p => p.trim());
            if (parts.length >= 4) {
                results.push({
                    accountHolderName: parts[0],
                    amount: parseFloat(parts[1]),
                    accountNumber: parts[2],
                    ifscCode: parts[3],
                    bankName: parts[4] || ''
                });
            }
        }

        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Parsed data", results, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const getBulkHistory = async (req, res) => {
    reqInfo(req);
    try {
        const criteria: any = { isDeleted: false };
        if (req.user && req.user.role === 'user') criteria.userId = req.user._id;

        const data = await getData(bulkUploadModel, criteria, {}, { sort: { createdAt: -1 } });
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Bulk history fetched", data, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};
