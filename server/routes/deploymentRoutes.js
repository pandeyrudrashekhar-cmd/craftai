import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import {
  listDeployments,
  getDeployment,
  deleteDeployment,
  publishProject,
  deployToVercel,
  deployToNetlify,
  connectCustomDomain,
  getCustomDomain,
  verifyCustomDomain,
  deleteCustomDomain
} from '../controllers/deploymentController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = Router({ mergeParams: true });
router.use(authenticate);
const deploymentActionLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (request) => request.auth.userId
});

router.route('/:projectId/deployments/publish')
  .post(deploymentActionLimit, publishProject);

router.route('/:projectId/deployments/vercel')
  .post(deploymentActionLimit, deployToVercel);

router.route('/:projectId/deployments/netlify')
  .post(deploymentActionLimit, deployToNetlify);

router.route('/:projectId/deployments')
  .get(listDeployments);

router.route('/:projectId/deployments/:deploymentId')
  .get(getDeployment)
  .delete(deleteDeployment);

router.route('/:projectId/deployments/:deploymentId/domain')
  .get(getCustomDomain)
  .post(connectCustomDomain)
  .delete(deleteCustomDomain);

router.post('/:projectId/deployments/:deploymentId/domain/verify', verifyCustomDomain);

export default router;
