import { Cashfree, CFEnvironment } from 'cashfree-pg';
import dotenv from 'dotenv';

dotenv.config();

const cashfree = new Cashfree(
    process.env.ENVIRONMENT === 'prod' ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX,
    process.env.CASHFREE_APP_ID || '',
    process.env.CASHFREE_SECRET_KEY || ''
);

export const createOrder = async (orderData: {
    order_id: string;
    order_amount: number;
    order_currency: string;
    customer_details: {
        customer_id: string;
        customer_phone: string;
        customer_name?: string;
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
        const response = await cashfree.PGFetchOrder(orderId);
        return response.data;
    } catch (error: any) {
        console.error('Cashfree Get Order Error:', error.response?.data || error.message);
        throw error;
    }
};

export const verifyWebhookSignature = (signature: string, rawBody: string, timestamp: string) => {
    try {
        cashfree.PGVerifyWebhookSignature(signature, rawBody, timestamp);
        return true;
    } catch (error) {
        console.error('Webhook Signature Verification Failed:', error);
        return false;
    }
};
