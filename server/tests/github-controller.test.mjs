import assert from 'node:assert/strict';
import { prisma } from '../config/prisma.js';
import { getGitHubRepositories, getGitHubRepositoryBranches, githubCallback, pushProjectToGitHub } from '../controllers/githubController.js';

const originalFetch = globalThis.fetch;
const originalUserFindUnique = prisma.user.findUnique;
const originalConnectionUpsert = prisma.gitHubConnection.upsert;
const originalConnectionFindUnique = prisma.gitHubConnection.findUnique;
const originalOAuthStateFindUnique = prisma.gitHubOAuthState.findUnique;
const originalOAuthStateUpdateMany = prisma.gitHubOAuthState.updateMany;
const originalProjectFindFirst = prisma.project.findFirst;
const originalProjectFileFindMany = prisma.projectFile.findMany;
const originalClientUrl = process.env.CLIENT_URL;
const originalClientId = process.env.GITHUB_CLIENT_ID;
const originalClientSecret = process.env.GITHUB_CLIENT_SECRET;
const originalCallbackUrl = process.env.GITHUB_CALLBACK_URL;

function makeState(userId) {
  return `test-state-${userId}`;
}

async function invoke(state = makeState('user-1')) {
  const response = {
    statusCode: null,
    redirectUrl: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    redirect(url) { this.redirectUrl = url; return this; }
  };
  let error = null;
  await githubCallback({ query: { code: 'oauth-code', state } }, response, (nextError) => { error = nextError; });
  return { response, error };
}

async function invokeRepositories(query = {}, userId = 'user-1') {
  const response = {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
  let error = null;
  await getGitHubRepositories({ auth: { userId }, query }, response, (nextError) => { error = nextError; });
  return { response, error };
}

async function invokeBranches(owner = 'octocat', repo = 'craftai', query = {}, userId = 'user-1') {
  const response = {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
  let error = null;
  await getGitHubRepositoryBranches({ auth: { userId }, params: { owner, repo }, query }, response, (nextError) => { error = nextError; });
  return { response, error };
}

async function invokePush(body = { projectId: 'project-1', branch: 'main' }, owner = 'octocat', repo = 'craftai', userId = 'user-1') {
  const response = {
    statusCode: null,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
  let error = null;
  await pushProjectToGitHub({ auth: { userId }, params: { owner, repo }, body }, response, (nextError) => { error = nextError; });
  return { response, error };
}

try {
  process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.GITHUB_CLIENT_ID = 'client-id';
  process.env.GITHUB_CLIENT_SECRET = 'server-secret';
  process.env.GITHUB_CALLBACK_URL = 'http://localhost:5000/api/github/callback';

  const upserts = [];
  prisma.gitHubOAuthState.findUnique = async () => ({ id: 'state-1', userId: 'user-1', expiresAt: new Date(Date.now() + 600000), usedAt: null });
  prisma.gitHubOAuthState.updateMany = async () => ({ count: 1 });
  prisma.user.findUnique = async () => ({ id: 'user-1' });
  prisma.gitHubConnection.upsert = async (args) => { upserts.push(args); return { id: 'connection-1' }; };
  globalThis.fetch = async (url) => {
    if (url === 'https://github.com/login/oauth/access_token') {
      return new Response(JSON.stringify({ access_token: 'github-secret-token' }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: 12345, login: 'octocat' }), { status: 200 });
  };

  const result = await invoke();
  assert.equal(result.error, null);
  assert.match(result.response.redirectUrl, /^http:\/\/localhost:5173\/github\/callback\?success=true&username=octocat$/);
  assert.equal(result.response.redirectUrl.includes('github-secret-token'), false);
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0].where, { userId: 'user-1' });
  assert.equal(upserts[0].create.userId, 'user-1');
  assert.equal(upserts[0].create.githubUserId, '12345');
  assert.equal(upserts[0].create.username, 'octocat');
  assert.equal(upserts[0].create.accessToken, 'github-secret-token');
  console.log('TEST 1 PASS: GitHub callback persists connection without exposing token');

  const secondResult = await invoke();
  assert.equal(secondResult.error, null);
  assert.equal(upserts.length, 2);
  assert.deepEqual(upserts[1].update, {
    githubUserId: '12345',
    username: 'octocat',
    accessToken: 'github-secret-token'
  });
  console.log('TEST 2 PASS: GitHub callback updates an existing connection');

  prisma.user.findUnique = async () => null;
  const missingUser = await invoke();
  assert.match(missingUser.response.redirectUrl, /error=user_not_found/);
  console.log('TEST 3 PASS: Missing CraftAI user is rejected');

  prisma.gitHubConnection.findUnique = async () => ({ accessToken: 'github-secret-token' });
  let repositoryRequest;
  globalThis.fetch = async (url, options) => {
    repositoryRequest = { url: String(url), options };
    return new Response(JSON.stringify([{
      id: 7,
      name: 'craftai',
      full_name: 'octocat/craftai',
      private: true,
      html_url: 'https://github.com/octocat/craftai',
      description: 'Website builder',
      default_branch: 'main',
      owner: { login: 'octocat' },
      access_token: 'should-not-be-returned'
    }]), { status: 200 });
  };
  const repositories = await invokeRepositories({ page: '2', per_page: '10' });
  assert.equal(repositories.error, null);
  assert.deepEqual(repositories.response.payload.repositories, [{
    id: 7,
    name: 'craftai',
    full_name: 'octocat/craftai',
    private: true,
    html_url: 'https://github.com/octocat/craftai',
    description: 'Website builder',
    default_branch: 'main',
    owner: { login: 'octocat' }
  }]);
  assert.equal(repositoryRequest.options.headers.Authorization, 'Bearer github-secret-token');
  assert.match(repositoryRequest.url, /page=2/);
  assert.match(repositoryRequest.url, /per_page=10/);
  assert.equal(JSON.stringify(repositories.response.payload).includes('github-secret-token'), false);
  console.log('TEST 4 PASS: Authenticated repositories are projected without token data');

  prisma.gitHubConnection.findUnique = async () => null;
  const disconnected = await invokeRepositories();
  assert.equal(disconnected.error.statusCode, 404);
  assert.equal(disconnected.error.message, 'GitHub account is not connected.');
  console.log('TEST 5 PASS: Missing GitHub connection returns 404');

  prisma.gitHubConnection.findUnique = async () => ({ accessToken: 'revoked-token' });
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 });
  const revoked = await invokeRepositories();
  assert.equal(revoked.error.statusCode, 502);
  assert.equal(revoked.error.message.includes('revoked-token'), false);
  console.log('TEST 6 PASS: GitHub token errors are handled without exposure');

  let requestedUserId;
  prisma.gitHubConnection.findUnique = async ({ where }) => {
    requestedUserId = where.userId;
    return null;
  };
  const otherUser = await invokeRepositories({}, 'user-2');
  assert.equal(otherUser.error.statusCode, 404);
  assert.equal(requestedUserId, 'user-2');
  console.log('TEST 7 PASS: Repository lookup is isolated by CraftAI user ID');

  prisma.gitHubConnection.findUnique = async ({ where }) => {
    requestedUserId = where.userId;
    return { accessToken: 'branch-token' };
  };
  let branchRequest;
  globalThis.fetch = async (url, options) => {
    branchRequest = { url: String(url), options };
    return new Response(JSON.stringify([
      { name: 'main', protected: true, commit: { sha: 'secret-sha' }, access_token: 'not-safe' },
      { name: 'feature/login', protected: false }
    ]), { status: 200 });
  };
  const branchResult = await invokeBranches('octocat', 'craftai', { page: '2', per_page: '20' });
  assert.equal(branchResult.error, null);
  assert.deepEqual(branchResult.response.payload.branches, [
    { name: 'main', protected: true },
    { name: 'feature/login', protected: false }
  ]);
  assert.equal(requestedUserId, 'user-1');
  assert.equal(branchRequest.options.headers.Authorization, 'Bearer branch-token');
  assert.match(branchRequest.url, /page=2/);
  assert.match(branchRequest.url, /per_page=20/);
  assert.equal(JSON.stringify(branchResult.response.payload).includes('branch-token'), false);
  console.log('TEST 8 PASS: Authenticated branch fetch is sanitized and paginated');

  prisma.gitHubConnection.findUnique = async () => null;
  const missingBranchConnection = await invokeBranches();
  assert.equal(missingBranchConnection.error.statusCode, 404);
  console.log('TEST 9 PASS: Missing connection rejects branch fetch');

  prisma.gitHubConnection.findUnique = async () => ({ accessToken: 'branch-token' });
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 });
  const forbiddenBranches = await invokeBranches();
  assert.equal(forbiddenBranches.error.statusCode, 502);
  assert.equal(forbiddenBranches.error.message.includes('branch-token'), false);
  console.log('TEST 10 PASS: GitHub branch 403 is handled without token exposure');

  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 });
  const unauthorizedBranches = await invokeBranches();
  assert.equal(unauthorizedBranches.error.statusCode, 502);
  assert.equal(unauthorizedBranches.error.message.includes('branch-token'), false);
  console.log('TEST 11 PASS: GitHub branch 401 is handled without token exposure');

  prisma.gitHubConnection.findUnique = async ({ where }) => {
    requestedUserId = where.userId;
    return { accessToken: 'branch-token' };
  };
  const isolatedBranches = await invokeBranches('octocat', 'craftai', {}, 'user-2');
  assert.equal(isolatedBranches.error.statusCode, 502);
  assert.equal(requestedUserId, 'user-2');
  console.log('TEST 12 PASS: Branch lookup uses the authenticated CraftAI user ID');

  prisma.project.findFirst = async ({ where }) => where.id === 'project-1' && where.userId === 'user-1' ? { id: 'project-1' } : null;
  prisma.projectFile.findMany = async () => [{ path: 'index.html', content: '<h1>CraftAI</h1>' }, { path: 'src/main.js', content: 'console.log("hello")' }];
  prisma.gitHubConnection.findUnique = async () => ({ accessToken: 'push-token', githubUserId: '42' });
  const pushRequests = [];
  globalThis.fetch = async (url, options = {}) => {
    pushRequests.push({ url: String(url), options });
    if (String(url).endsWith('/repos/octocat/craftai')) return new Response(JSON.stringify({ owner: { id: 42 } }), { status: 200 });
    if (String(url).includes('/git/ref/heads/main')) return new Response(JSON.stringify({ object: { sha: 'parent-sha' } }), { status: 200 });
    if (String(url).includes('/git/commits/parent-sha')) return new Response(JSON.stringify({ tree: { sha: 'base-tree' } }), { status: 200 });
    if (String(url).endsWith('/git/blobs')) return new Response(JSON.stringify({ sha: `blob-${pushRequests.length}` }), { status: 201 });
    if (String(url).endsWith('/git/trees')) return new Response(JSON.stringify({ sha: 'tree-sha' }), { status: 201 });
    if (String(url).endsWith('/git/commits')) return new Response(JSON.stringify({ sha: 'commit-sha', tree: { sha: 'tree-sha' }, html_url: 'https://github.com/octocat/craftai/commit/commit-sha' }), { status: 201 });
    if (String(url).includes('/git/refs/heads/main')) return new Response(JSON.stringify({ ref: 'refs/heads/main' }), { status: 200 });
    if (String(url).includes('/git/trees/tree-sha?recursive=1')) return new Response(JSON.stringify({ tree: [
      { path: 'index.html', type: 'blob', sha: 'blob-4' },
      { path: 'src/main.js', type: 'blob', sha: 'blob-5' }
    ] }), { status: 200 });
    return new Response('{}', { status: 500 });
  };
  const pushed = await invokePush();
  assert.equal(pushed.error, null);
  assert.deepEqual(pushed.response.payload, {
    repository: 'octocat/craftai',
    branch: 'main',
    commitSha: 'commit-sha',
    commitUrl: 'https://github.com/octocat/craftai/commit/commit-sha',
    message: 'Project pushed to GitHub successfully.'
  });
  assert.equal(JSON.stringify(pushed.response.payload).includes('push-token'), false);
  assert.equal(pushRequests.filter(({ url }) => url.endsWith('/git/blobs')).length, 2);
  console.log('TEST 13 PASS: Project files are committed through GitHub Git Data API');

  const secondPushRequests = [];
  globalThis.fetch = async (url, options = {}) => {
    secondPushRequests.push({ url: String(url), options });
    if (String(url).endsWith('/repos/octocat/craftai')) return new Response(JSON.stringify({ owner: { id: 42 } }), { status: 200 });
    if (String(url).includes('/git/ref/heads/main')) return new Response(JSON.stringify({ object: { sha: 'second-parent-sha' } }), { status: 200 });
    if (String(url).includes('/git/commits/second-parent-sha')) return new Response(JSON.stringify({ tree: { sha: 'second-base-tree' } }), { status: 200 });
    if (String(url).endsWith('/git/blobs')) return new Response(JSON.stringify({ sha: `second-blob-${secondPushRequests.length}` }), { status: 201 });
    if (String(url).endsWith('/git/trees')) return new Response(JSON.stringify({ sha: 'second-tree-sha' }), { status: 201 });
    if (String(url).endsWith('/git/commits')) return new Response(JSON.stringify({ sha: 'second-commit-sha', tree: { sha: 'second-tree-sha' }, html_url: 'https://github.com/octocat/craftai/commit/second-commit-sha' }), { status: 201 });
    if (String(url).includes('/git/refs/heads/main')) return new Response(JSON.stringify({ ref: 'refs/heads/main' }), { status: 200 });
    if (String(url).includes('/git/trees/second-tree-sha?recursive=1')) return new Response(JSON.stringify({ tree: [
      { path: 'index.html', type: 'blob', sha: 'second-blob-4' },
      { path: 'src/main.js', type: 'blob', sha: 'second-blob-5' }
    ] }), { status: 200 });
    return new Response('{}', { status: 500 });
  };
  const pushedAgain = await invokePush();
  assert.equal(pushedAgain.error, null);
  assert.equal(pushedAgain.response.payload.commitSha, 'second-commit-sha');
  const secondCommitPayload = JSON.parse(secondPushRequests.find(({ url, options }) => url.endsWith('/git/commits') && options.method === 'POST').options.body);
  assert.deepEqual(secondCommitPayload.parents, ['second-parent-sha']);
  console.log('TEST 14 PASS: Repeated push uses the latest selected branch ref');

  prisma.project.findFirst = async () => null;
  const wrongOwner = await invokePush();
  assert.equal(wrongOwner.error.statusCode, 404);
  console.log('TEST 15 PASS: Project ownership is enforced');

  prisma.project.findFirst = async () => ({ id: 'project-1' });
  prisma.gitHubConnection.findUnique = async () => null;
  const noConnection = await invokePush();
  assert.equal(noConnection.error.statusCode, 404);
  console.log('TEST 16 PASS: Missing GitHub connection is rejected');

  prisma.gitHubConnection.findUnique = async () => ({ accessToken: 'push-token', githubUserId: '42' });
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 });
  const githubUnauthorized = await invokePush();
  assert.equal(githubUnauthorized.error.statusCode, 502);
  assert.equal(githubUnauthorized.error.message.includes('push-token'), false);
  console.log('TEST 17 PASS: GitHub 401 is handled without token exposure');

  globalThis.fetch = async (url) => String(url).endsWith('/repos/octocat/craftai')
    ? new Response(JSON.stringify({ owner: { id: 999 } }), { status: 200 })
    : new Response('{}', { status: 500 });
  const wrongRepository = await invokePush();
  assert.equal(wrongRepository.error.statusCode, 404);
  console.log('TEST 18 PASS: Repository ownership is verified');

  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/repos/octocat/craftai')) return new Response(JSON.stringify({ owner: { id: 42 } }), { status: 200 });
    return new Response(JSON.stringify({ message: 'Branch not found' }), { status: 404 });
  };
  const wrongBranch = await invokePush();
  assert.equal(wrongBranch.error.statusCode, 404);
  console.log('TEST 19 PASS: Missing GitHub branch is handled');
} finally {
  globalThis.fetch = originalFetch;
  prisma.user.findUnique = originalUserFindUnique;
  prisma.gitHubConnection.upsert = originalConnectionUpsert;
  prisma.gitHubConnection.findUnique = originalConnectionFindUnique;
  prisma.gitHubOAuthState.findUnique = originalOAuthStateFindUnique;
  prisma.gitHubOAuthState.updateMany = originalOAuthStateUpdateMany;
  prisma.project.findFirst = originalProjectFindFirst;
  prisma.projectFile.findMany = originalProjectFileFindMany;
  for (const [key, value] of [['CLIENT_URL', originalClientUrl], ['GITHUB_CLIENT_ID', originalClientId], ['GITHUB_CLIENT_SECRET', originalClientSecret], ['GITHUB_CALLBACK_URL', originalCallbackUrl]]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log('GitHub controller tests passed.');
