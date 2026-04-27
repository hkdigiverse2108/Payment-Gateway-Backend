import { Router } from 'express';
import { withdrawController } from '../controllers';
import { apiAuthMiddleware } from '../middleware';

const router = Router();

router.post('/manual', apiAuthMiddleware, withdrawController.manualWithdraw);
router.post('/quick-paste', apiAuthMiddleware, withdrawController.quickPasteWithdraw);
router.get('/bulk-history', apiAuthMiddleware, withdrawController.getBulkHistory);

export const withdrawRouter = router;
