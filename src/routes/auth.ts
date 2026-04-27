import { Router } from 'express';
import { authController } from '../controllers';

const router = Router();

router.post('/login', authController.login);
router.post('/change-password', authController.changePassword);

export const authRouter = router;
