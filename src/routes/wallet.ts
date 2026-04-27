import { Router } from 'express';
import { walletController } from '../controllers';
import { apiAuthMiddleware } from '../middleware';

const router = Router();

router.get('/activity', apiAuthMiddleware, walletController.getWalletActivity);
router.get('/balance', apiAuthMiddleware, walletController.getWalletBalance);

export const walletRouter = router;
