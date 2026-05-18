import Razorpay from 'razorpay';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || ''
});

export const createRazorpayOrder = async (data: {
    amount: number;
    currency: string;
    receipt: string;
}) => {
    try {
        const options = {
            amount: data.amount * 100, 
            currency: data.currency,
            receipt: data.receipt,
        };
        const order = await razorpay.orders.create(options);
        return order;
    } catch (error: any) {
        console.error('Razorpay Create Order Error:', error);
        throw error;
    }
};

export const getRazorpayOrder = async (orderId: string) => {
    try {
        const order = await razorpay.orders.fetch(orderId);
        return order;
    } catch (error: any) {
        console.error('Razorpay Get Order Error:', error);
        throw error;
    }
};

export const verifyRazorpayWebhookSignature = (signature: string, rawBody: string, webhookSecret: string) => {
    try {
        const expectedSignature = crypto
            .createHmac('sha256', webhookSecret)
            .update(rawBody)
            .digest('hex');
        return signature === expectedSignature;
    } catch (error) {
        console.error('Razorpay Webhook Verification Failed:', error);
        return false;
    }
};

// just check work or not [live use webhook signature] after delete this
export const verifyRazorpayPaymentSignature = (orderId: string, paymentId: string, signature: string) => {
    try {
        const secret = process.env.RAZORPAY_KEY_SECRET || '';
        const generatedSignature = crypto
            .createHmac('sha256', secret)
            .update(orderId + "|" + paymentId)
            .digest('hex');
        return generatedSignature === signature;
    } catch (error) {
        console.error('Razorpay Payment Signature Verification Failed:', error);
        return false;
    }
};