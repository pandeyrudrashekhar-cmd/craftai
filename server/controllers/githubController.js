import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/appError.js';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com';
const pushProjectSchema = z.object({
  projectId: z.string().trim().min(1),
  branch: z.string().trim().min(1).max(255)
});

function getGitHubConfig() {
  return {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackUrl:
      process.env.GITHUB_CALLBACK_URL ||
      'http://localhost:5000/api/github/callback'
  };
}

/*
 * Step 1:
 * Logged-in CraftAI user clicks "Connect GitHub".
 *
 * We generate a random state value and encode the
 * CraftAI user ID inside it.
 */
export async function startGitHubOAuth(request, response, next) {
  try {
    const { clientId, callbackUrl } = getGitHubConfig();

    if (!clientId) {
      throw new AppError('GitHub OAuth is not configured.', 500);
    }

    const userId = request.auth.userId;

    const state = crypto.randomBytes(32).toString('base64url');
    await prisma.gitHubOAuthState.create({
      data: {
        stateHash: hashOAuthState(state),
        userId,
        expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS)
      }
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: 'repo',
      state
    });

    response.status(200).json({
      authorizationUrl: `${GITHUB_AUTHORIZE_URL}?${params.toString()}`
    });
  } catch (error) {
    next(error);
  }
}

/*
 * Step 2:
 * GitHub redirects the user back here with:
 *
 * ?code=...
 * ?state=...
 *
 * We exchange the temporary code for an access token.
 */
export async function githubCallback(request, response, next) {
  try {
    const { clientId, clientSecret, callbackUrl } = getGitHubConfig();

    const { code, state } = request.query;

    if (!code || !state) return redirectOAuthFailure(response, 'invalid_request');

    if (!clientId || !clientSecret) return redirectOAuthFailure(response, 'oauth_not_configured');

    const oauthState = await prisma.gitHubOAuthState.findUnique({
      where: { stateHash: hashOAuthState(state) }
    });
    if (!oauthState || oauthState.usedAt || oauthState.expiresAt <= new Date()) {
      return redirectOAuthFailure(response, 'invalid_state');
    }
    const stateData = { userId: oauthState.userId };
    const consumed = await prisma.gitHubOAuthState.updateMany({
      where: { id: oauthState.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() }
    });
    if (!consumed.count) return redirectOAuthFailure(response, 'invalid_state');

    /*
     * Exchange GitHub authorization code
     * for an access token.
     */
    const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || tokenData.error) {
      return redirectOAuthFailure(response, 'github_authorization_failed');
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return redirectOAuthFailure(response, 'github_authorization_failed');
    }

    /*
     * Get the authenticated GitHub user.
     */
    const githubUserResponse = await fetch(
      `${GITHUB_API_URL}/user`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    if (!githubUserResponse.ok) {
      return redirectOAuthFailure(response, 'github_account_unavailable');
    }

    const githubUser = await githubUserResponse.json();

    const craftAIUser = await prisma.user.findUnique({
      where: { id: stateData.userId },
      select: { id: true }
    });
    if (!craftAIUser) {
      return redirectOAuthFailure(response, 'user_not_found');
    }

    await prisma.gitHubConnection.upsert({
      where: { userId: craftAIUser.id },
      update: {
        githubUserId: String(githubUser.id),
        username: githubUser.login,
        accessToken
      },
      create: {
        userId: craftAIUser.id,
        githubUserId: String(githubUser.id),
        username: githubUser.login,
        accessToken
      }
    });

    /*
     * Do NOT send the GitHub access token to the browser.
     */
    const clientUrl =
      process.env.CLIENT_URL ||
      'http://localhost:5173';

    const redirectUrl = new URL(
      '/github/callback',
      clientUrl
    );

    redirectUrl.searchParams.set(
      'success',
      'true'
    );

    redirectUrl.searchParams.set(
      'username',
      githubUser.login
    );

    response.redirect(redirectUrl.toString());
  } catch (error) {
    if (!response.headersSent) return redirectOAuthFailure(response, error instanceof AppError && error.statusCode === 404 ? 'user_not_found' : 'oauth_failed');
    next(error);
  }
}

export async function getGitHubStatus(request, response, next) {
  try {
    const connection = await prisma.gitHubConnection.findUnique({
      where: { userId: request.auth.userId },
      select: { username: true }
    });
    response.status(200).json(connection ? { connected: true, username: connection.username } : { connected: false, username: null });
  } catch (error) {
    next(error);
  }
}

/*
 * Test endpoint.
 *
 * Once the GitHub connection is stored,
 * this will become our repository-listing endpoint.
 */
export async function getGitHubRepositories(request, response, next) {
  try {
    const connection = await prisma.gitHubConnection.findUnique({
      where: { userId: request.auth.userId },
      select: { accessToken: true }
    });
    if (!connection) {
      throw new AppError('GitHub account is not connected.', 404);
    }

    const pageValue = Number.parseInt(request.query.page, 10);
    const perPageValue = Number.parseInt(request.query.per_page, 10);
    const page = Number.isInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 1000) : 1;
    const perPage = Number.isInteger(perPageValue) && perPageValue > 0 ? Math.min(perPageValue, 100) : 30;
    const repositoriesUrl = new URL(`${GITHUB_API_URL}/user/repos`);
    repositoriesUrl.searchParams.set('page', String(page));
    repositoriesUrl.searchParams.set('per_page', String(perPage));
    repositoriesUrl.searchParams.set('sort', 'updated');
    repositoriesUrl.searchParams.set('direction', 'desc');

    const githubResponse = await fetch(repositoriesUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${connection.accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    const githubBody = await githubResponse.json().catch(() => null);

    if (githubResponse.status === 401) {
      throw new AppError('GitHub access is no longer valid. Please reconnect your GitHub account.', 502);
    }
    if (!githubResponse.ok) {
      throw new AppError('Unable to fetch GitHub repositories.', 502);
    }

    const repositories = Array.isArray(githubBody)
      ? githubBody.map((repository) => ({
          id: repository.id,
          name: repository.name,
          full_name: repository.full_name,
          private: repository.private,
          html_url: repository.html_url,
          description: repository.description,
          default_branch: repository.default_branch,
          owner: { login: repository.owner?.login }
        }))
      : [];

    response.status(200).json({ repositories });
  } catch (error) {
    next(error);
  }
}

export async function getGitHubRepositoryBranches(request, response, next) {
  try {
    const connection = await prisma.gitHubConnection.findUnique({
      where: { userId: request.auth.userId },
      select: { accessToken: true }
    });
    if (!connection) {
      throw new AppError('GitHub account is not connected.', 404);
    }

    const pageValue = Number.parseInt(request.query.page, 10);
    const perPageValue = Number.parseInt(request.query.per_page, 10);
    const page = Number.isInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 1000) : 1;
    const perPage = Number.isInteger(perPageValue) && perPageValue > 0 ? Math.min(perPageValue, 100) : 30;
    const branchesUrl = new URL(`${GITHUB_API_URL}/repos/${encodeURIComponent(request.params.owner)}/${encodeURIComponent(request.params.repo)}/branches`);
    branchesUrl.searchParams.set('page', String(page));
    branchesUrl.searchParams.set('per_page', String(perPage));

    const githubResponse = await fetch(branchesUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${connection.accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    const githubBody = await githubResponse.json().catch(() => null);

    if (githubResponse.status === 401 || githubResponse.status === 403) {
      throw new AppError('Unable to access GitHub branches. Please reconnect your GitHub account.', 502);
    }
    if (!githubResponse.ok) {
      throw new AppError('Unable to fetch GitHub branches.', 502);
    }

    const branches = Array.isArray(githubBody)
      ? githubBody.map((branch) => ({ name: branch.name, protected: Boolean(branch.protected) }))
      : [];
    response.status(200).json({ branches });
  } catch (error) {
    next(error);
  }
}

function parsePushProjectInput(input) {
  try {
    return pushProjectSchema.parse(input);
  } catch (error) {
    throw new AppError(error.issues?.[0]?.message || 'Invalid GitHub push request.', 400);
  }
}

function isSafeProjectFilePath(path) {
  return typeof path === 'string'
    && path.length > 0
    && path.length <= 255
    && !path.startsWith('/')
    && !path.includes('\\')
    && !path.split('/').some((part) => !part || part === '.' || part === '..');
}

async function readGitHubResponse(response) {
  return response.json().catch(() => null);
}

function throwGitHubRequestError(status, message, notFoundMessage) {
  if (status === 404) throw new AppError(notFoundMessage, 404);
  if (status === 401 || status === 403) throw new AppError('GitHub access is no longer valid or is not permitted.', 502);
  throw new AppError(message, 502);
}

export async function pushProjectToGitHub(request, response, next) {
  try {
    const { projectId, branch } = parsePushProjectInput(request.body);
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: request.auth.userId },
      select: { id: true }
    });
    if (!project) throw new AppError('Project not found.', 404);

    const files = await prisma.projectFile.findMany({
      where: { projectId: project.id },
      select: { path: true, content: true },
      orderBy: { path: 'asc' }
    });
    if (!files.length) throw new AppError('Project has no files to push.', 400);
    if (files.some((file) => !isSafeProjectFilePath(file.path) || typeof file.content !== 'string')) {
      throw new AppError('Project contains an invalid file path or content.', 400);
    }

    const connection = await prisma.gitHubConnection.findUnique({
      where: { userId: request.auth.userId },
      select: { accessToken: true, githubUserId: true }
    });
    if (!connection) throw new AppError('GitHub account is not connected.', 404);

    const repositoryUrl = `${GITHUB_API_URL}/repos/${encodeURIComponent(request.params.owner)}/${encodeURIComponent(request.params.repo)}`;
    const repositoryResponse = await fetch(repositoryUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${connection.accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    const repository = await readGitHubResponse(repositoryResponse);
    if (!repositoryResponse.ok) throwGitHubRequestError(repositoryResponse.status, 'Unable to fetch GitHub repository.', 'GitHub repository not found.');
    if (String(repository.owner?.id) !== String(connection.githubUserId)) {
      throw new AppError('GitHub repository not found.', 404);
    }

    const encodedBranch = encodeURIComponent(branch);
    const refResponse = await fetch(`${repositoryUrl}/git/ref/heads/${encodedBranch}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${connection.accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    const ref = await readGitHubResponse(refResponse);
    if (!refResponse.ok) throwGitHubRequestError(refResponse.status, 'Unable to fetch GitHub branch.', 'GitHub branch not found.');
    if (!ref.object?.sha) throw new AppError('GitHub branch not found.', 404);

    const commitResponse = await fetch(`${repositoryUrl}/git/commits/${encodeURIComponent(ref.object.sha)}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${connection.accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    const commit = await readGitHubResponse(commitResponse);
    if (!commitResponse.ok) throwGitHubRequestError(commitResponse.status, 'Unable to fetch GitHub branch commit.', 'GitHub branch not found.');

    const blobs = [];
    for (const file of files) {
      const blobResponse = await fetch(`${GITHUB_API_URL}/repos/${encodeURIComponent(request.params.owner)}/${encodeURIComponent(request.params.repo)}/git/blobs`, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${connection.accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: Buffer.from(file.content, 'utf8').toString('base64'), encoding: 'base64' })
      });
      const blob = await readGitHubResponse(blobResponse);
      if (!blobResponse.ok || !blob.sha) throwGitHubRequestError(blobResponse.status, 'Unable to upload project files to GitHub.', 'GitHub repository not found.');
      blobs.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    const treeResponse = await fetch(`${repositoryUrl}/git/trees`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${connection.accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ base_tree: commit.tree?.sha, tree: blobs })
    });
    const tree = await readGitHubResponse(treeResponse);
    if (!treeResponse.ok || !tree.sha) throwGitHubRequestError(treeResponse.status, 'Unable to create the GitHub file tree.', 'GitHub repository not found.');

    const newCommitResponse = await fetch(`${repositoryUrl}/git/commits`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${connection.accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: `Update ${projectId} from CraftAI`, tree: tree.sha, parents: [ref.object.sha] })
    });
    const newCommit = await readGitHubResponse(newCommitResponse);
    if (!newCommitResponse.ok || !newCommit.sha) throwGitHubRequestError(newCommitResponse.status, 'Unable to create the GitHub commit.', 'GitHub repository not found.');

    const updateRefResponse = await fetch(`${repositoryUrl}/git/refs/heads/${encodedBranch}`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${connection.accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sha: newCommit.sha, force: false })
    });
    const updatedRef = await readGitHubResponse(updateRefResponse);
    if (!updateRefResponse.ok) throwGitHubRequestError(updateRefResponse.status, 'Unable to update the GitHub branch.', 'GitHub branch not found.');

    const verificationTreeSha = newCommit.tree?.sha || tree.sha;
    const verificationResponse = await fetch(`${repositoryUrl}/git/trees/${encodeURIComponent(verificationTreeSha)}?recursive=1`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${connection.accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    const verificationTree = await readGitHubResponse(verificationResponse);
    if (!verificationResponse.ok) {
      throwGitHubRequestError(verificationResponse.status, 'Unable to verify the GitHub commit tree.', 'GitHub commit could not be verified.');
    }
    const verifiedFiles = new Map(
      (Array.isArray(verificationTree?.tree) ? verificationTree.tree : [])
        .filter((entry) => entry.type === 'blob')
        .map((entry) => [entry.path, entry.sha])
    );
    const blobShas = new Map(blobs.map((blob) => [blob.path, blob.sha]));
    if (files.some((file) => verifiedFiles.get(file.path) !== blobShas.get(file.path))) {
      throw new AppError('GitHub commit verification failed: project files are missing from the resulting tree.', 502);
    }

    response.status(200).json({
      repository: `${request.params.owner}/${request.params.repo}`,
      branch,
      commitSha: newCommit.sha,
      commitUrl: newCommit.html_url || `https://github.com/${request.params.owner}/${request.params.repo}/commit/${newCommit.sha}`,
      message: 'Project pushed to GitHub successfully.'
    });
  } catch (error) {
    next(error);
  }
}

function hashOAuthState(state) {
  return crypto.createHash('sha256').update(state).digest('hex');
}

function redirectOAuthFailure(response, code) {
  const redirectUrl = new URL('/github/callback', process.env.CLIENT_URL || 'http://localhost:5173');
  redirectUrl.searchParams.set('success', 'false');
  redirectUrl.searchParams.set('error', code);
  response.redirect(redirectUrl.toString());
}