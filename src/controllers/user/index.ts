import { userModel } from '../../database';
import { apiResponse, createUserService, generateHash, HTTP_STATUS, isValidObjectId, resolvePagination, resolveSortAndFilter, USER_ROLE } from '../../common';
import { reqInfo, responseMessage, updateData, getFirstMatch, createData, getDataWithSorting, countData } from '../../helper';
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

        if (!response) return res.status(HTTP_STATUS.NOT_IMPLEMENTED).json(new apiResponse(HTTP_STATUS.NOT_IMPLEMENTED, responseMessage.addDataError, {}, {}));
        return res.status(HTTP_STATUS.CREATED).json(new apiResponse(HTTP_STATUS.CREATED, responseMessage.addDataSuccess("User"), response, {}));
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
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.deleteDataSuccess("User"), {}, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const getUsers = async (req, res) => {
    reqInfo(req);
    let { user } = req.headers
    try {
        const { error, value } = getUsersSchema.validate(req.query || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const { criteria, options, page, limit } = resolveSortAndFilter(value, ['userName', 'email', 'mobileNumber']);

        if (user?.role === USER_ROLE.USER) {
            criteria._id = isValidObjectId(user._id)
        } else {
            criteria.role = { $ne: USER_ROLE.ADMIN }
        }

        const response = await getDataWithSorting(userModel, criteria, { _id: 1, userName: 1, email: 1, mobileNumber: 1, isActive: 1, createdAt: 1, updatedAt: 1 }, options);
        const totalCount = await countData(userModel, criteria);
        const stateObj = await resolvePagination(page, limit);

        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.getDataSuccess("Users"), {
            data: response,
            totalData: totalCount,
            state: stateObj
        }, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};
