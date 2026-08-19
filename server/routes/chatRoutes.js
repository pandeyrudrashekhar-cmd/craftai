import { Router } from 'express';
import { getChat, sendChat } from '../controllers/chatController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
router.use(authenticate);
router.route('/:id/chat').get(getChat).post(sendChat);
export default router;
