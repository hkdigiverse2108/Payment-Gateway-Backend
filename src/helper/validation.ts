import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

export const validateRequest = (schema: Joi.ObjectSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const { error } = schema.validate(req.body, { abortEarly: true });
        
        if (error) {
            const errorMessage = error.details[0].message.replace(/\"/g, "");
            // Customizing error message to match user requirement: "<field_name> is required"
            // Joi's default is often "field_name is required"
            return res.status(400).json({
                success: false,
                error: errorMessage
            });
        }
        next();
    };
};
