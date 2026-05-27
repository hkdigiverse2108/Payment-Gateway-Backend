import { walletActivityModel, userModel } from '../../database';
import { HTTP_STATUS, resolveSortAndFilter, USER_ROLE, WALLET_ACTIVITY_TYPE } from '../../common';
import { reqInfo, responseMessage, getDataWithSorting, countData, getFirstMatch, redisGet, redisSet, apiResponse } from '../../helper';
import { getWalletActivitySchema } from '../../validation';

export const getWalletActivity = async (req, res) => {
    reqInfo(req);
    try {
        const { error, value } = getWalletActivitySchema.validate(req.query || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const { criteria, options, page, limit } = resolveSortAndFilter(value, ['description', 'brand']);

        const cacheUserKey = req.user && req.user.role === USER_ROLE.USER ? req.user._id : 'admin';
        const queryKey = Object.keys(value || {}).sort().map((key) => `${key}=${JSON.stringify(value[key])}`).join('&') || 'all';
        const cacheKey = `wallet:activity:${cacheUserKey}:${queryKey}`;

        const cached = await redisGet(cacheKey);
        if (cached) {
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Wallet Activity"), cached, {}));
        }

        if (req.user && req.user.role === USER_ROLE.USER) {
            criteria.userId = req.user._id;
        }

        const response = await getDataWithSorting(walletActivityModel, criteria, {}, options);
        const totalCount = await countData(walletActivityModel, criteria);

        // Calculate Stats for Ledger
        const statsCriteria: any = { isDeleted: false };
        if (criteria.userId) { statsCriteria.userId = criteria.userId; }
        if (criteria.createdAt) statsCriteria.createdAt = criteria.createdAt;

        const activityStats = await walletActivityModel.aggregate([
            { $match: statsCriteria },
            { $group: { _id: "$type", totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } }
        ]);

        const stats = {
            totalActivities: totalCount,
            totalCredits: activityStats.find(s => s._id === WALLET_ACTIVITY_TYPE.CREDIT)?.totalAmount || 0,
            totalDebits: activityStats.find(s => s._id === WALLET_ACTIVITY_TYPE.DEBIT)?.totalAmount || 0
        };

        const result = {
            data: response,
            totalData: totalCount,
            stats,
            state: {
                page,
                limit,
                page_limit: Math.ceil(totalCount / limit) || 1
            }
        };

        await redisSet(cacheKey, result, 300);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Wallet Activity"), result, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const getWalletBalance = async (req, res) => {
    reqInfo(req);
    try {
        const cacheKey = `wallet:balance:${req.user._id}`;
        const cached = await redisGet(cacheKey);
        if (cached) return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Balance fetched successfully", cached, {}));

        const user = await getFirstMatch(userModel, { _id: req.user._id }, { walletBalance: 1 });
        const result = { walletBalance: user?.walletBalance || 0 };
        await redisSet(cacheKey, result, 60);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Balance fetched successfully", result, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};
