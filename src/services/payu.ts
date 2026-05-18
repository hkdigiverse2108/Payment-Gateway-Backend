import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

// const PAYU_BASE_URL = process.env.PAYU_ENV === "live" ? "https://secure.payu.in" : "https://test.payu.in";

export const createPayUOrder = async (orderData: {
  txnid: string;
  amount: number;
  firstname: string;
  email: string;
  phone: string;
  productinfo?: string;
}) => {
  try {
    const productinfo = orderData.productinfo || "Wallet Deposit";
    const amount = Number(orderData.amount).toFixed(2);

    const hashString = `${process.env.PAYU_MERCHANT_KEY}|${orderData.txnid}|${amount}|${productinfo}|${orderData.firstname}|${orderData.email}|||||||||||${process.env.PAYU_MERCHANT_SALT}`;
    const hash = crypto.createHash("sha512").update(hashString).digest("hex");
    return {
      key: process.env.PAYU_MERCHANT_KEY,
      txnid: orderData.txnid,
      amount,
      firstname: orderData.firstname,
      email: orderData.email,
      phone: orderData.phone,
      productinfo,
      surl: process.env.PAYU_SUCCESS_URL,
      furl: process.env.PAYU_FAILURE_URL,
      hash,
      action: `${process.env.PAYU_BASE_URL}/_payment`
    };
  } catch (error: any) {
    console.error(
      "PayU Create Order Error:",
      error.message
    );
    throw error;
  }
};

export const verifyPayUHash = ( payuResponse: any ) => {
  try {
    const hashString = `${process.env.PAYU_MERCHANT_SALT}|${payuResponse.status}|||||||||||${payuResponse.email}|${payuResponse.firstname}|${payuResponse.productinfo}|${payuResponse.amount}|${payuResponse.txnid}|${process.env.PAYU_MERCHANT_KEY}`;
    const generatedHash = crypto
      .createHash("sha512")
      .update(hashString)
      .digest("hex");

    return generatedHash === payuResponse.hash;
  } catch (error) {
    console.error( "PayU Hash Verification Failed:", error );
    return false;
  }
};