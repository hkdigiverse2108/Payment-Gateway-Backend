import axios from "axios";
import PaytmChecksum from "paytmchecksum";
import dotenv from "dotenv";

dotenv.config();

const MERCHANT_KEY = process.env.PAYTM_MERCHANT_KEY || "";
const MID = process.env.PAYTM_MID || "";

async function sendFakeWebhook(orderId: string, amount: string) {
    if (!MERCHANT_KEY) {
        console.error("Missing PAYTM_MERCHANT_KEY in .env");
        return;
    }

    console.log(`Generating fake webhook for Order ID: ${orderId} with Amount: ${amount}`);

    // Create the fake payload (without CHECKSUMHASH)
    const body = {
        MID: MID,
        ORDERID: orderId,
        TXNAMOUNT: amount,
        CURRENCY: "INR",
        TXNID: `FAKE_TXN_${Date.now()}`,
        BANKTXNID: `BANK_${Date.now()}`,
        STATUS: "TXN_SUCCESS",
        RESPCODE: "01",
        RESPMSG: "Txn Success",
        TXNDATE: new Date().toISOString(),
        GATEWAYNAME: "WALLET",
        BANKNAME: "PAYTM",
        PAYMENTMODE: "PPI"
    };

    try {
        const checksum = await PaytmChecksum.generateSignature(JSON.stringify(body), MERCHANT_KEY);
        
        const webhookPayload = {
            ...body,
            CHECKSUMHASH: checksum
        };

        console.log("Sending Fake Webhook Payload:", webhookPayload);

        // Send to your local server
        const response = await axios.post("http://localhost:5000/transaction/webhook/paytm", webhookPayload, {
            headers: {
                "Content-Type": "application/json"
            }
        });

        console.log("Webhook Response Status:", response.status);
        console.log("Webhook Response Data:", response.data);
        console.log("\nSuccess! Check your database to see if the transaction status was updated to SUCCESS.");
        
    } catch (error: any) {
        console.error("Error sending fake webhook:");
        console.error(error?.response?.data || error.message);
    }
}

const myOrderIdToTest = "PT1778733697538";
const amountToTest = "10.00";

sendFakeWebhook(myOrderIdToTest, amountToTest);
