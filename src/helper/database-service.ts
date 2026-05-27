import { redisClient } from '../database/redis';

export const createOne = async (model: any, data: any) => {
    return new model(data).save();
};

export const createData = async (model: any, data: any) => {
    return new model(data).save();
};

export const getFirstMatch = async ( model: any, criteria: any, projection: any = {}, options: any = {} ) => {
    const isLean = options.lean !== undefined ? options.lean : true;
    return model.findOne(criteria, projection, { ...options, lean: isLean });
};

export const updateData = async (model: any, criteria: any, dataToSet: any, options: any = {}) => {
    options.new = true;
    options.lean = true;
    return model.findOneAndUpdate(criteria, dataToSet, options);
};

export const getDataWithSorting = async (model: any, criteria: any, projection: any = {}, options: any = {}) => {
    let query = model.find(criteria, projection);
    query = query.lean();
    if (options.sort) query = query.sort(options.sort);
    if (options.skip && options.skip > 0) query = query.skip(options.skip);
    if (options.limit && options.limit > 0) query = query.limit(options.limit);
    if (options.populate) query = query.populate(options.populate);
    return query.exec();
};

export const countData = async (model: any, criteria: any) => {
    return model.countDocuments(criteria);
};

export const getData = async (model: any, criteria: any, projection: any = {}, options: any = {}) => {
    options.lean = true;
    return model.find(criteria, projection, options);
};

export const redisGet = async <T = any>(key: string): Promise<T | null> => {
    try {
        const data = await redisClient.get(key);
        if (!data) return null;
        const value = typeof data === 'string' ? data : data.toString();
        return JSON.parse(value) as T;
    } catch (error) {
        console.error(`[Redis GET Error] key=${key}`, error);
        return null; 
    }
};

export const redisSet = async (key: string, value: any, ttlSeconds: number = 600): Promise<boolean> => {
    try {
        const data = typeof value === 'string' ? value : JSON.stringify(value);
        if (ttlSeconds) {
            await redisClient.setEx(key, ttlSeconds, data);
        } else {
            await redisClient.set(key, data);
        }
        return true;
    } catch (error) {
        console.error(`[Redis SET Error] key=${key}`, error);
        return false;
    }
};

export const redisDel = async (key: string): Promise<boolean> => {
    try {
        await redisClient.del(key);
        return true;
    } catch (error) {
        console.error(`[Redis DEL Error] key=${key}`, error);
        return false;
    }
};

export const redisDelPattern = async (pattern: string): Promise<void> => {
    try {
        const keys = await redisClient.keys(pattern);
        if (!keys.length) return;
        await redisClient.del(keys);
    } catch (error) {
        console.error(`[Redis DEL PATTERN Error] pattern=${pattern}`, error);
    }
};

export const clearTransactionCaches = async (orderId?: string) => {
    if (orderId) {
        await redisDelPattern(`transaction_status:*:${orderId}`);
    }
    await redisDelPattern('transactions:list:*');
    await redisDelPattern('transactions:export:*');
};