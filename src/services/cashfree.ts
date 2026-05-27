import { Cashfree, CFEnvironment } from 'cashfree-pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { redisGet, redisSet } from '../helper/database-service';

dotenv.config();

const cashfree = new Cashfree(
    process.env.ENVIRONMENT === 'prod' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX,
    process.env.CASHFREE_APP_ID || '',
    process.env.CASHFREE_SECRET_KEY || ''
);

export const createCashfreeOrder = async (orderData: {
    order_id: string;
    order_amount: number;
    order_currency: string;
    customer_details: {
        customer_id: string;
        customer_phone: string;
        customer_name?: string;
        customer_email?: string;
    };
    order_meta?: {
        return_url?: string;
        notify_url?: string;
    };
}) => {
    try {
        const response = await cashfree.PGCreateOrder(orderData);
        console.log('response => ', response);
        console.log('response => ', response.data.products);
        return response.data;
    } catch (error: any) {
        console.error('Cashfree Create Order Error:', error.response?.data || error.message);
        throw error;
    }
};

export const getOrder = async (orderId: string) => {
    try {
        const cacheKey = `cashfree:order:${orderId}`;
        const cachedOrder = await redisGet(cacheKey);
        if (cachedOrder) { return cachedOrder; }
        const response = await cashfree.PGFetchOrder(orderId);

        await redisSet(cacheKey, response.data, 300);
        return response.data;
    } catch (error: any) {
        console.error(
            'Cashfree Get Order Error:',
            error.response?.data || error.message
        );
        throw error;
    }
};

export const verifyCashfreeWebhookSignature = (signature: string, rawBody: string, timestamp: string) => {
    try {
        cashfree.PGVerifyWebhookSignature(signature, rawBody, timestamp);
        return true;
    } catch (error) {
        console.error('Webhook Signature Verification Failed:', error);
        
           // Manual verification fallback- Using this code Failed show 
        try {
            const secretKey = process.env.CASHFREE_SECRET_KEY || '';
            const data = timestamp + rawBody;
            const expectedSignature = crypto.createHmac('sha256', secretKey).update(data).digest('base64');
            if (expectedSignature === signature) return true;
            console.error(`Manual verification also failed. Expected: ${expectedSignature}, Received: ${signature}`);
        } catch (err) {
            console.error('Manual signature generation error:', err);
        }
        if (process.env.BYPASS_WEBHOOK_SIGNATURES === 'true' && process.env.ENVIRONMENT !== 'prod') {
            console.warn('Bypassing Cashfree webhook signature verification in Sandbox environment for testing.');
            return true; // Bypass in Sandbox
        }

        return false;
    }
};
