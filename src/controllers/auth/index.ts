import { userModel } from '../../database';
import { compareHash, generateHash, generateToken, HTTP_STATUS, isValidObjectId } from '../../common';
import { getFirstMatch, reqInfo, responseMessage, redisDelPattern, redisGet, redisSet, apiResponse } from '../../helper';
import { changePasswordSchema, loginSchema } from '../../validation';

export const login = async (req, res) => {
    reqInfo(req);
    try {
        const { error, value } = loginSchema.validate(req.body);
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const identifier = value.username?.trim();
        const cacheKey = `auth:user:${identifier?.toLowerCase()}`;
        let user = await redisGet<any>(cacheKey);

        if (!user) {
            user = await getFirstMatch(userModel, {
                $or: [
                    { username: { $regex: `^${identifier}$`, $options: 'i' } },
                    { email: identifier?.toLowerCase() }
                ],
                isDeleted: false
            });
            if (user) { await redisSet(cacheKey, user, 300); }
        }
        if (!user) return res.status(HTTP_STATUS.UNAUTHORIZED).json(new apiResponse(HTTP_STATUS.UNAUTHORIZED, responseMessage.invalidCredentials(value.username), {}, {}));

        const isMatch = await compareHash(value.password, user.password);
        if (!isMatch) return res.status(HTTP_STATUS.UNAUTHORIZED).json(new apiResponse(HTTP_STATUS.UNAUTHORIZED, responseMessage.invalidUserPassword, {}, {}));
        if (!user.isActive) return res.status(HTTP_STATUS.FORBIDDEN).json(new apiResponse(HTTP_STATUS.FORBIDDEN, responseMessage.accountBlock, {}, {}));

        const token = await generateToken(user, '2h');
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.loginSuccess, {
            _id: user._id,
            name: user.name,
            username: user.username,
            mobileNumber: user.mobileNumber,
            role: user.role,
            token
        }, {}));
    } catch (error) {
        console.log(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};

export const changePassword = async (req, res) => {
    reqInfo(req);
    try {
        const { error, value } = changePasswordSchema.validate(req.body || {});
        if (error) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, error.details[0].message, {}, {}));

        const userData = await getFirstMatch(userModel, { _id: isValidObjectId(value.userId), isDeleted: false }, {}, {lean: false});
        if (!userData) return res.status(HTTP_STATUS.NOT_FOUND).json(new apiResponse(HTTP_STATUS.NOT_FOUND, responseMessage.invalidUserEmail, {}, {}));

        const isMatch = await compareHash(value.oldPassword, userData.password);
        if (!isMatch) return res.status(HTTP_STATUS.BAD_REQUEST).json(new apiResponse(HTTP_STATUS.BAD_REQUEST, responseMessage.invalidUserPassword, {}, {}));

        const hashPassword = await generateHash(value.newPassword);
        userData.password = hashPassword;

        await userData.save();
        await redisDelPattern(`auth:user:${userData.username?.toLowerCase()}`);
        await redisDelPattern(`auth:user:${userData.email?.toLowerCase()}`);
        return res.status(HTTP_STATUS.OK).json(new apiResponse(HTTP_STATUS.OK, responseMessage.passwordChangeSuccess, {}, {}));
    } catch (error) {
        console.error(error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(new apiResponse(HTTP_STATUS.INTERNAL_SERVER_ERROR, responseMessage.internalServerError, {}, error));
    }
};
