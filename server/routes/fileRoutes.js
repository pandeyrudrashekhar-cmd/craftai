import { Router } from 'express';
import { createFile, deleteFile, getFile, initializeFiles, listFiles, updateFile } from '../controllers/fileController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
router.use(authenticate);
router.post('/:id/files/initialize', initializeFiles);
router.route('/:id/files').get(listFiles).post(createFile);
router.route('/:id/files/:fileId').get(getFile).put(updateFile).delete(deleteFile);
export default router;
