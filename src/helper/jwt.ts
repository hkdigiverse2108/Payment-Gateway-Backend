import jwt from 'jsonwebtoken'
import { apiResponse, HTTP_STATUS, isValidObjectId } from '../common'
import { Request, Response } from 'express'
import { responseMessage } from './response'
import { getFirstMatch } from './database-service';
import { userModel } from '../database';

const jwt_token_secret = process.env.JWT_TOKEN_SECRET;

export const userJWT = async (req: Request, res: Response, next) => {
    let { authorization } = req.headers,
        result: any
    if (authorization) {
        try {
            let isVerifyToken: any = jwt.verify(authorization, jwt_token_secret)
            let result = await getFirstMatch(userModel, { _id: isValidObjectId(isVerifyToken._id) })
            if (result?.isBlock == false) return res.status(HTTP_STATUS.FORBIDDEN).json(new apiResponse(HTTP_STATUS.FORBIDDEN, responseMessage?.accountBlock, {}, {}));
            if (result?.isActive == true && isVerifyToken.authToken == result.authToken) {
                req.headers.user = result
                return next()
            } else {
                return res.status(HTTP_STATUS.UNAUTHORIZED).json(new apiResponse(HTTP_STATUS.UNAUTHORIZED, responseMessage?.invalidToken, {}, {}));
            }
        } catch (err) {
            if (err.message == "invalid signature") return res.status(HTTP_STATUS.FORBIDDEN).json(new apiResponse(HTTP_STATUS.FORBIDDEN, responseMessage?.differentToken, {}, {}));
            console.log(err)
            return res.status(HTTP_STATUS.UNAUTHORIZED).json(new apiResponse(HTTP_STATUS.UNAUTHORIZED, responseMessage.invalidToken, {}, {}));
        }
    } else {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(new apiResponse(HTTP_STATUS.UNAUTHORIZED, responseMessage?.tokenNotFound, {}, {}));
    }
}
