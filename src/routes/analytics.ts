import { Router } from 'express';
import { analyticsController } from '../controllers';
import { apiAuthMiddleware } from '../middleware';

const router = Router();

router.get('/volume', apiAuthMiddleware, analyticsController.getVolumeStats);
router.get('/chart', apiAuthMiddleware, analyticsController.getDailyVolumeChart);

export const analyticsRouter = router;
