import { Router } from 'express';
import { userController } from '../controllers';

const router = Router();

router.post('/add', userController.createUser);
router.put('/edit', userController.updateUser);
router.delete('/:id', userController.deleteUser);
router.get('/all', userController.getUsers);

export const userRouter = router;
