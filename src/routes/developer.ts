import { Router } from 'express';
import { developerController } from '../controllers';
import { apiAuthMiddleware } from '../middleware';

const router = Router();

router.get('/config', apiAuthMiddleware, developerController.getMerchantConfig);
router.put('/config', apiAuthMiddleware, developerController.updateMerchantConfig);
router.post('/regenerate-keys', apiAuthMiddleware, developerController.regenerateApiKeys);
router.post('/test-webhook', apiAuthMiddleware, developerController.testWebhook);

export const developerRouter = router;
