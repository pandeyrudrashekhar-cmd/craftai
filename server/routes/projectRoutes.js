import { Router } from 'express';
import { createProject, deleteProject, downloadProject, getProject, listProjects, updateProject } from '../controllers/projectController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router();
router.use(authenticate);
router.route('/').post(createProject).get(listProjects);
router.get('/:id/download', downloadProject);
router.route('/:id').get(getProject).patch(updateProject).delete(deleteProject);
export default router;
