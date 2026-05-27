import { userModel } from '../../database';
import { createUserService, generateHash, HTTP_STATUS, isValidObjectId, resolvePagination, resolveSortAndFilter, USER_ROLE } from '../../common';
import { reqInfo, responseMessage, updateData, getFirstMatch, createData, getDataWithSorting, countData, redisGet, redisSet, redisDelPattern, redisDel, apiResponse } from '../../helper';
import { addUserSchema, deleteUserSchema, editUserSchema, getUsersSchema } from '../../validation';

export const createUser = async (req, res) => {
    reqInfo(req);
    try {
        const { error, value } = addUserSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const existingUser = await getFirstMatch(userModel, {
            isDeleted: false,
            $or: [{ username: value.username }, { email: value.email }, { mobileNumber: value.mobileNumber }]
        });

        if (existingUser) {
            let errorText = existingUser.username === value.username ? "Username" : existingUser.email === value.email ? "Email" : "Mobile Number";
            return res.status(HTTP_STATUS.CONFLICT).json(new apiResponse(HTTP_STATUS.CONFLICT, responseMessage.dataAlreadyExist(errorText), {}, {}));
        }

        let key = await createUserService();
        value.apiKey = key.apiKey;
        value.secretKey = key.secretKey;
        value.role = USER_ROLE.USER;
        value.password = await generateHash(value.password)
        const response = await createData(userModel, value);

        if (response) {
            await redisDelPattern('users:list:*');
            return res.status(HTTP_STATUS.CREATED).json(new apiResponse(HTTP_STATUS.CREATED, responseMessage.addDataSuccess("User"), response, {}));
        }
        return res.status(HTTP_STATUS.NOT_IMPLEMENTED).json(new apiResponse(HTTP_STATUS.NOT_IMPLEMENTED, responseMessage.addDataError, {}, {}));
    } catch (error: any) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const updateUser = async (req, res) => {
    reqInfo(req);
    try {
        const { error, value } = editUserSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const existingUser = await getFirstMatch(userModel, {
            isDeleted: false,
            _id: { $ne: isValidObjectId(value.userId) },
            $or: [{ username: value.username }, { email: value.email }, { mobileNumber: value.mobileNumber }]
        });

        if (existingUser) {
            let errorText = existingUser.username === value.username ? "Username" : existingUser.email === value.email ? "Email" : "Mobile Number";
            return res.status(HTTP_STATUS.CONFLICT).json(new apiResponse(HTTP_STATUS.CONFLICT, responseMessage.dataAlreadyExist(errorText), {}, {}));
        }

        const user = await updateData(userModel, { _id: isValidObjectId(value.userId), isDeleted: false }, value);
        if (!user) return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, responseMessage.getDataNotFound("User"), {}, {}));

        await redisDelPattern('users:list:*');
        await redisDel(`user:${value.userId}`);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.updateDataSuccess("User"), user, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const deleteUser = async (req, res) => {
    reqInfo(req);
    try {
        const { error, value } = deleteUserSchema.validate(req.params || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const user = await updateData(userModel, { _id: isValidObjectId(value.id), isDeleted: false }, { isDeleted: true });
        if (!user) return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, responseMessage.getDataNotFound("User"), {}, {}));

        await redisDelPattern('users:list:*');
        await redisDel(`user:${value.id}`);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.deleteDataSuccess("User"), {}, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const getUsers = async (req, res) => {
    reqInfo(req);
    const user = req.user;
    try {
        const { error, value } = getUsersSchema.validate(req.query || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const { criteria, options, page, limit } = resolveSortAndFilter(value, ['username', 'email', 'mobileNumber']);

        const cacheUserKey = user?.role === USER_ROLE.USER ? user._id : 'admin';
        const queryKey = Object.keys(value).sort().map((key) => `${key}=${JSON.stringify(value[key])}`).join('&') || 'all';
        const cacheKey = `users:list:${cacheUserKey}:${queryKey}`;

        const cachedResult = await redisGet(cacheKey);
        if (cachedResult) {
            return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Users"), cachedResult, {}));
        }

        if (user?.role === USER_ROLE.USER) {
            criteria._id = isValidObjectId(user._id)
        } else {
            criteria.role = { $ne: USER_ROLE.ADMIN }
        }
        
        const response = await getDataWithSorting(userModel, criteria, {}, options);
        const totalCount = await countData(userModel, criteria);
        const stateObj = await resolvePagination(page, limit);
        const result = { data: response, totalData: totalCount, state: stateObj };

        await redisSet(cacheKey, result, 300);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Users"), result, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};
