import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2026-04-22.dahlia'
});

export const createStripeCheckoutSession = async (data: {
    amount: number;
    currency?: string;
    orderId: string;
    userId: string;
    customerEmail?: string;
    customerName?: string;
    successUrl: string;
    cancelUrl: string;
}) => {
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: data.currency || 'INR',
                        product_data: {
                            name: 'Wallet Deposit',
                        },
                        unit_amount: data.amount * 100,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: data.successUrl,
            cancel_url: data.cancelUrl,
            customer_email: data.customerEmail || undefined,
            metadata: {
                orderId: data.orderId,
                userId: data.userId,
                customerName: data.customerName || '',
            }
        });

        return {
            id: session.id,
            url: session.url,
            amount: data.amount,
            currency: data.currency || 'INR',
            status: session.payment_status,
            metadata: session.metadata
        };
    } catch (error: any) {
        console.error('Stripe Checkout Session Error:', error.message);
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
        // Failed Payment Check: after Remove
        if (process.env.BYPASS_WEBHOOK_SIGNATURES === 'true' && process.env.ENVIRONMENT !== 'prod') {
            console.warn('Bypassing Stripe webhook signature verification in Sandbox environment for testing.');
            return JSON.parse(rawBody.toString('utf8'));
        }
        throw error;
    }
};