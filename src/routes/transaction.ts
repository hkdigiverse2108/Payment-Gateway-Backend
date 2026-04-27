import { Router } from 'express';
import { transactionController } from '../controllers';
import { apiAuthMiddleware } from '../middleware';

const router = Router();

router.get('/all', apiAuthMiddleware, transactionController.getTransactions);
router.get('/export', apiAuthMiddleware, transactionController.exportTransactions);

router.post('/payin', transactionController.createDeposit);
router.get('/status', apiAuthMiddleware, transactionController.getTransactionStatus);

export const transactionRouter = router;
