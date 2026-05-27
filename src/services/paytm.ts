import axios from 'axios';
import PaytmChecksum from 'paytmchecksum';
import dotenv from 'dotenv';

dotenv.config();

const MID = process.env.PAYTM_MID ?? '';
const MERCHANT_KEY = process.env.PAYTM_MERCHANT_KEY ?? '';
const WEBSITE = process.env.PAYTM_WEBSITE ?? 'WEBSTAGING';
// const isProd = process.env.NODE_ENV === 'production' && process.env.PAYTM_ENVIRONMENT === 'PROD';
// const BASE_URL = isProd ? 'https://securegw.paytm.in' : 'https://securegw-stage.paytm.in';

interface PaytmOrderParams {
    amount: number;
    orderId: string;
    userId?: string;
    customerPhone?: string;
    customerEmail?: string;
}

interface PaytmOrderResponse {
    merchantId: string;
    merchantTransactionId: string;
    amount: number;
    currency: string;
    txnToken: string;
    redirectUrl: string;
    status: string;
    rawPayload: any;
}

export async function createPaytmOrder(params: PaytmOrderParams): Promise<PaytmOrderResponse> {
    const merchantTransactionId = params.orderId;
    const callbackUrl = process.env.PAYTM_CALLBACK_URL || 'http://localhost:5000/transaction/verify/paytm';
    const paytmParams: any = {};
    paytmParams.body = {
        requestType: "Payment",
        mid: MID,
        websiteName: WEBSITE,
        orderId: merchantTransactionId,
        callbackUrl: callbackUrl,
        txnAmount: {
            value: params.amount.toFixed(2),
            currency: "INR",
        },
        userInfo: {
            custId: params.userId?.toString() || "",
            mobileNo: params.customerPhone?.toString() || "",
            email: params.customerEmail?.toString() || ""
        },
    };

    try {
        console.log("PAYTM REQUEST BODY:", JSON.stringify(paytmParams.body, null, 2));
        const checksum = await PaytmChecksum.generateSignature(JSON.stringify(paytmParams.body), MERCHANT_KEY);
        paytmParams.head = { signature: checksum };

        const endpoint = `${process.env.PAYTM_BASE_URL}/theia/api/v1/initiateTransaction?mid=${MID}&orderId=${merchantTransactionId}`;
        const { data } = await axios.post(endpoint, paytmParams, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (data.body && data.body.resultInfo && data.body.resultInfo.resultStatus === 'S') {
            return {
                merchantId: MID,
                merchantTransactionId,
                amount: params.amount,
                currency: 'INR',
                txnToken: data.body.txnToken,
                redirectUrl: `${process.env.PAYTM_BASE_URL}/theia/api/v1/showPaymentPage?mid=${MID}&orderId=${merchantTransactionId}`,
                status: 'INITIATED',
                rawPayload: data
            };
        } else {
            console.log("PAYTM ERROR RESPONSE:", JSON.stringify(data, null, 2));
            throw new Error(data.body?.resultInfo?.resultMsg || "Failed to generate Paytm token");
        }
    } catch (error: any) {
        console.log("PAYLOAD:", JSON.stringify(paytmParams, null, 2));
        console.error('Paytm Create Order Error:', error?.response?.data || error.message);
        throw error;
    }
}

export async function getPaytmOrderStatus(merchantTransactionId: string) {
    const paytmParams: any = {};
    paytmParams.body = {
        mid: MID,
        orderId: merchantTransactionId,
    };
    try {
        const checksum = await PaytmChecksum.generateSignature(JSON.stringify(paytmParams.body), MERCHANT_KEY);
        paytmParams.head = { signature: checksum };
        const endpoint = `${process.env.PAYTM_BASE_URL}/v3/order/status`;
        const { data } = await axios.post(endpoint, paytmParams, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return data.body;
    } catch (error: any) {
        console.error('Paytm Get Order Status Error:', error?.response?.data || error.message);
        throw error;
    }
}

export function verifyPaytmPaymentSignature(paytmResponse: any): boolean {
    const signature = paytmResponse.CHECKSUMHASH;
    if (!signature) return false;

    const body = { ...paytmResponse };
    delete body.CHECKSUMHASH;

    return PaytmChecksum.verifySignature(body, MERCHANT_KEY, signature);
}
