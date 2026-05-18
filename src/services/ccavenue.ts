import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

/* Encrypts plain text using AES-128-CBC with the MD5 hashed Working Key */
export function encrypt(plainText: string, workingKey: string): string {
    const md5 = crypto.createHash('md5').update(workingKey).digest();
    const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
    const cipher = crypto.createCipheriv('aes-128-cbc', md5, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

/* Decrypts hex-encoded ciphertext using AES-128-CBC with the MD5 hashed Working Key */
export function decrypt(encryptedText: string, workingKey: string): string {
    const md5 = crypto.createHash('md5').update(workingKey).digest();
    const iv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
    const decipher = crypto.createDecipheriv('aes-128-cbc', md5, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

export const createCcavenueOrder = async (orderData: {
    order_id: string;
    amount: number;
    currency?: string;
    customer_phone: string;
    customer_name?: string;
    customer_email?: string;
    redirect_url: string;
    cancel_url: string;
}) => {
    try {
        const merchantId = process.env.CCAVENUE_MERCHANT_ID || '';
        const workingKey = process.env.CCAVENUE_WORKING_KEY || '';
        const accessCode = process.env.CCAVENUE_ACCESS_CODE || '';
        const baseUrl = process.env.CCAVENUE_BASE_URL || 'https://test.ccavenue.com';

        if (!merchantId || !workingKey || !accessCode) {
            throw new Error("Missing CCAvenue credentials in environment variables");
        }

        const params = new URLSearchParams({
            merchant_id: merchantId,
            order_id: orderData.order_id,
            amount: Number(orderData.amount).toFixed(2),
            currency: orderData.currency || 'INR',
            redirect_url: orderData.redirect_url,
            cancel_url: orderData.cancel_url,
            language: 'EN',
            billing_name: orderData.customer_name || 'Customer',
            billing_tel: orderData.customer_phone,
            billing_email: orderData.customer_email || '',
        });

        const plainParams = params.toString();
        const encRequest = encrypt(plainParams, workingKey);

        return {
            encRequest,
            access_code: accessCode,
            action: `${baseUrl}/transaction/transaction.do?command=initiateTransaction`,
            merchant_id: merchantId
        };
    } catch (error: any) {
        console.error('CCAvenue Create Order Error:', error.message);
        throw error;
    }
};
