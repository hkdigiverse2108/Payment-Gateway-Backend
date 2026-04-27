import { Request, Response, NextFunction } from 'express';
import { apiResponse, HTTP_STATUS } from '../common';

export const roleMiddleware = (roles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user;
        if (!user || !roles.includes(user.role)) {
            return res.status(HTTP_STATUS.FORBIDDEN).json(new apiResponse(HTTP_STATUS.FORBIDDEN, "Access denied", {}, {}));
        }
        next();
    };
};
