import { transactionModel } from '../../database';
import { HTTP_STATUS, TRANSACTION_TYPE, ORDER_STATUS, USER_ROLE } from '../../common';
import { reqInfo, responseMessage, redisGet, redisSet, apiResponse } from '../../helper';
import moment from 'moment-timezone';

export const getVolumeStats = async (req, res) => {
    reqInfo(req);
    try {
        const cacheUserKey = req.user && req.user.role === USER_ROLE.USER ? req.user._id.toString() : 'admin';
        const cacheKey = `analytics:volumeStats:${cacheUserKey}`;
        const cachedStats = await redisGet(cacheKey);
        if (cachedStats) {
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Volume stats fetched", cachedStats, {}));
        }
        const criteria: any = { isDeleted: false };
        
        // Role based filtering
        if (req.user && req.user.role === USER_ROLE.USER) { criteria.userId = req.user._id; }

        const stats = await transactionModel.aggregate([
            { $match: criteria },
            {
                $group: {
                    _id: "$type",
                    totalVolume: { $sum: "$amount" },
                    successVolume: { $sum: { $cond: [{ $eq: ["$status", ORDER_STATUS.SUCCESS] }, "$amount", 0] }},
                    totalCount: { $sum: 1 },
                    successCount: { $sum: { $cond: [{ $eq: ["$status", ORDER_STATUS.SUCCESS] }, 1, 0] }}
                }
            }
        ]);

        const formattedStats = {
            deposit: stats.find(s => s._id === TRANSACTION_TYPE.DEPOSIT) || { totalVolume: 0, successVolume: 0, totalCount: 0, successCount: 0 },
            withdraw: stats.find(s => s._id === TRANSACTION_TYPE.WITHDRAW) || { totalVolume: 0, successVolume: 0, totalCount: 0, successCount: 0 }
        };
        await redisSet(cacheKey, formattedStats, 300);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Volume stats fetched", formattedStats, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const getDailyVolumeChart = async (req, res) => {
    reqInfo(req);
    try {
        const cacheUserKey = req.user && req.user.role === USER_ROLE.USER ? req.user._id.toString() : 'admin';
        const days = parseInt(req.query.days as string) || 7;
        const cacheKey = `analytics:dailyVolumeChart:${cacheUserKey}:${days}`;
        const cachedChart = await redisGet(cacheKey);
        if (cachedChart) { return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Chart data fetched", cachedChart, {})); }
        const criteria: any = { isDeleted: false, status: ORDER_STATUS.SUCCESS };
        
        // Role based filtering
        if (req.user && req.user.role === USER_ROLE.USER) { criteria.userId = req.user._id; }

        const startDate = moment().subtract(days, 'days').startOf('day').toDate();
        criteria.createdAt = { $gte: startDate };

        const chartData = await transactionModel.aggregate([
            { $match: criteria },
            { $group: { _id: { date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, type: "$type" }, volume: { $sum: "$amount" } }},
            { $group: { _id: "$_id.date", deposits: { $sum: { $cond: [{ $eq: ["$_id.type", TRANSACTION_TYPE.DEPOSIT] }, "$volume", 0] } }, withdrawals: { $sum: { $cond: [{ $eq: ["$_id.type", TRANSACTION_TYPE.WITHDRAW] }, "$volume", 0] } } } },
            { $sort: { "_id": 1 } }
        ]);

        await redisSet(cacheKey, chartData, 300);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, "Chart data fetched", chartData, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};