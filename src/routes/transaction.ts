import { Router } from 'express';
import { transactionController } from '../controllers';
import { apiAuthMiddleware } from '../middleware';

const router = Router();

router.get('/all',transactionController.getTransactions);
router.get('/export', transactionController.exportTransactions);
router.post('/webhook/cashfree', transactionController.cashfreeWebhook);

router.post('/webhook/razorpay', transactionController.razorpayWebhook);
// just check payment successfull or not[live use Webhooks] , after delete this
router.post('/verify/razorpay', transactionController.verifyRazorpayPayment);

router.post('/webhook/payu', transactionController.payuWebhook);

router.post('/webhook/phonepe', transactionController.phonePeWebhook);
// just check payment successfull or not , after delete this and set webhook in dashboard
router.post('/verify/phonepe', transactionController.verifyPhonePePayment);

router.post('/webhook/paytm', transactionController.paytmWebhook);
// just check payment successfull or not[live use Webhooks] , after delete this
router.post('/verify/paytm', transactionController.verifyPaytmPayment);

router.post( '/webhook/stripe', transactionController.stripeWebhook );

router.post('/payin', apiAuthMiddleware, transactionController.createDeposit);
router.get('/status', apiAuthMiddleware, transactionController.getTransactionStatus);

export const transactionRouter = router;
