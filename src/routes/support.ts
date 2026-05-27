import { Router } from 'express';
import { supportController } from '../controllers';
import { roleMiddleware } from '../middleware';
import { USER_ROLE } from '../common';

const router = Router();

router.post('/ticket', supportController.createTicket);
router.get('/tickets', supportController.getTickets);
router.get('/ticket/:ticketId', supportController.getTicketById);
router.post('/ticket/close', supportController.closeTicket);
router.post('/ticket/escalate', supportController.escalateTicket);

router.post('/message', supportController.sendMessage);
router.get('/chat/:ticketId', supportController.getChatHistory);
router.put('/message/read', supportController.markMessagesRead);

router.post('/admin/reply', roleMiddleware([USER_ROLE.ADMIN]), supportController.adminReply);
router.post('/admin/accept', roleMiddleware([USER_ROLE.ADMIN]), supportController.acceptTicket);
router.put('/admin/ticket', roleMiddleware([USER_ROLE.ADMIN]), supportController.adminUpdateTicket);
router.get('/admin/escalated', roleMiddleware([USER_ROLE.ADMIN]), supportController.getEscalatedTickets);
router.get('/admin/stats', roleMiddleware([USER_ROLE.ADMIN]), supportController.getTicketStats);

export const supportRouter = router;
