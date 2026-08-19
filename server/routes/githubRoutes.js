import { Router } from 'express';

import {
  startGitHubOAuth,
  githubCallback,
  getGitHubRepositories,
  getGitHubRepositoryBranches,
  pushProjectToGitHub,
  getGitHubStatus
} from '../controllers/githubController.js';

import { authenticate } from '../middleware/authenticate.js';

const router = Router();

/*
 * User must be logged into CraftAI
 * before connecting GitHub.
 */
router.get('/connect', authenticate, startGitHubOAuth);
router.get('/status', authenticate, getGitHubStatus);

/*
 * GitHub calls this endpoint after authorization.
 *
 * IMPORTANT:
 * Do NOT put authenticate middleware here.
 *
 * GitHub is calling this URL directly.
 */
router.get('/callback', githubCallback);

/*
 * List repositories of connected GitHub account.
 */
router.get('/repositories', authenticate, getGitHubRepositories);
router.get('/repositories/:owner/:repo/branches', authenticate, getGitHubRepositoryBranches);
router.post('/repositories/:owner/:repo/push', authenticate, pushProjectToGitHub);

export default router;