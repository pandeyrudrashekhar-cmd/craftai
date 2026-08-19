import { Router } from 'express';
import { createVersion, listVersions, getVersion, restoreVersion, deleteVersion } from '../controllers/versionController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router({ mergeParams: true });
router.use(authenticate);

router.route('/:projectId/versions')
  .post(createVersion)
  .get(listVersions);

router.route('/:projectId/versions/:versionId')
  .get(getVersion)
  .delete(deleteVersion);

router.post('/:projectId/versions/:versionId/restore', restoreVersion);

export default router;
