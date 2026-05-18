import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2026-04-22.dahlia'
});

export const createStripePaymentIntent = async (data: {
    amount: number;
    currency?: string;
    orderId: string;
    userId: string;
    customerEmail?: string;
    customerName?: string;
}) => {
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: data.amount * 100,
            currency: data.currency || 'INR',

            metadata: {
                orderId: data.orderId,
                userId: data.userId,
                customerEmail: data.customerEmail || '',
                customerName: data.customerName || '',
            }
        });
        return {
            id: paymentIntent.id,
            client_secret: paymentIntent.client_secret,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: paymentIntent.status,
            metadata: paymentIntent.metadata
        };
    } catch (error: any) {
        console.error('Stripe Payment Intent Error:', error.message);
        throw error;
    }
};

export const verifyStripeWebhookSignature = (signature: string, rawBody: Buffer) => {
    try {
        return stripe.webhooks.constructEvent(
            rawBody,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET || ''
        );
    } catch (error) {
        console.error('Stripe Webhook Verify Error:', error);
        throw error;
    }
};