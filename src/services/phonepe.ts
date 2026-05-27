import crypto from 'crypto';
import dotenv from 'dotenv';
import { StandardCheckoutClient, Env, StandardCheckoutPayRequest } from '@phonepe-pg/pg-sdk-node';

dotenv.config();

// PhonePe Initialization using V2 SDK
const clientId = process.env.PHONEPE_CLIENT_ID ?? '';
const clientSecret = process.env.PHONEPE_CLIENT_SECRET ?? '';
const clientVersion = 1; // PhonePe Node SDK typically expects version as 1
const env = process.env.ENVIRONMENT === 'prod' ? Env.PRODUCTION : Env.SANDBOX;

const phonePeClient = StandardCheckoutClient.getInstance(clientId, clientSecret, clientVersion, env);

interface PhonePeOrderParams {
  amount: number;
  orderId: string;
  userId?: string;
}

interface PhonePeOrderResponse {
  merchantId: string;
  transactionId: string;
  merchantTransactionId: string;
  amount: number;
  currency: string;
  status: string;
  redirectUrl: string;
  rawPayload: any;
}

export async function createPhonePeOrder(params: PhonePeOrderParams): Promise<PhonePeOrderResponse> {
  const merchantTransactionId = `PP-${params.orderId}-${Date.now()}`;
  const amountInPaise = params.amount * 100; // SDK requires amount in paise

  const baseRedirectUrl = process.env.PHONEPE_REDIRECT_URL || '';
  const redirectUrl = `${baseRedirectUrl}?txn=${encodeURIComponent(merchantTransactionId)}`;

  const request = StandardCheckoutPayRequest.builder()
    .merchantOrderId(merchantTransactionId)
    .amount(amountInPaise)
    .redirectUrl(redirectUrl)
    .build();

  try {
    const response = await phonePeClient.pay(request);
    return {
      merchantId : process.env.PHONEPE_CLIENT_ID,
      transactionId: response.orderId || '',
      merchantTransactionId: merchantTransactionId,
      amount: amountInPaise,
      currency: 'INR',
      status: response.state,
      redirectUrl: response.redirectUrl,
      rawPayload: request
    } as PhonePeOrderResponse;
  } catch (error: any) {
    console.error('PhonePe Create Order Error:', error);
    throw error;
  }
}

export async function getPhonePeOrderStatus(merchantOrderId: string) {
  return await phonePeClient.getOrderStatus(merchantOrderId);
}

export function verifyPhonePeWebhookSignature(
  signatureHeader: string,
  rawBody: string,
  secret: string = process.env.PHONEPE_CLIENT_SECRET ?? ''
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
      
    if (expectedSignature === signatureHeader) return true;
    
    if (process.env.BYPASS_WEBHOOK_SIGNATURES === 'true' && process.env.ENVIRONMENT !== 'prod') {
        console.warn('Bypassing PhonePe webhook signature verification in Sandbox environment for testing.');
        return true;
    }
    return false;
  } catch (error) {
    console.error('PhonePe Webhook Signature Verify Error:', error);
    return false;
  }
}

// just check payment successfull or not , after delete this and set webhook in dashboard
export function verifyPhonePePaymentSignature(
  merchantId: string,
  merchantTransactionId: string,
  transactionId: string,
  signature: string,
  secret: string = process.env.PHONEPE_CLIENT_SECRET ?? ''
): boolean {
  const dataToSign = `${merchantId}|${merchantTransactionId}|${transactionId}`;
  const expected = crypto.createHmac('sha256', secret).update(dataToSign).digest('hex');
  return expected === signature;
}
