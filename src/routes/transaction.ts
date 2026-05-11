import { Router } from 'express';
import { transactionController } from '../controllers';
import { apiAuthMiddleware } from '../middleware';

const router = Router();

router.get('/all', apiAuthMiddleware, transactionController.getTransactions);
router.get('/export', apiAuthMiddleware, transactionController.exportTransactions);
router.post('/webhook/cashfree', transactionController.cashfreeWebhook);
router.post('/webhook/razorpay', transactionController.razorpayWebhook);
// just check pyment successfull or not , after delete this
router.post('/verify/razorpay', transactionController.verifyRazorpayPayment);

router.post('/payin', apiAuthMiddleware, transactionController.createDeposit);
router.get('/status', apiAuthMiddleware, transactionController.getTransactionStatus);

export const transactionRouter = router;
