import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { assertNetlifyConfigured, createNetlifyDeployment, waitForNetlifyDeployment } from '../services/netlifyService.js';

const sha1 = (content) => createHash('sha1').update(content).digest('hex');
const builtIndex = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>CraftAI Website</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n';
const builtAsset = 'console.log("built")';

const originalToken = process.env.NETLIFY_TOKEN;
const originalWorkerUrl = process.env.NETLIFY_BUILD_WORKER_URL;
const originalWorkerSecret = process.env.NETLIFY_BUILD_WORKER_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const originalFetch = globalThis.fetch;

try {
  process.env.NODE_ENV = 'test';
  delete process.env.NETLIFY_TOKEN;
  assert.throws(() => assertNetlifyConfigured(), /Set NETLIFY_TOKEN on the server/);
  console.log('TEST 1 PASS: Missing Netlify token is reported clearly');

  process.env.NETLIFY_TOKEN = 'test-token';
  process.env.NETLIFY_BUILD_WORKER_URL = 'http://build-worker.test/build';
  process.env.NETLIFY_BUILD_WORKER_SECRET = 'worker-secret';
  const workerResponse = (body, status = 200) => {
    const payload = JSON.stringify(body);
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', process.env.NETLIFY_BUILD_WORKER_SECRET).update(`${timestamp}.${payload}`).digest('hex');
    return new Response(payload, { status, headers: { 'Content-Type': 'application/json', 'X-CraftAI-Worker-Timestamp': timestamp, 'X-CraftAI-Worker-Signature': signature } });
  };
  const requests = [];
  let statusReads = 0;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url === process.env.NETLIFY_BUILD_WORKER_URL) {
      return workerResponse({ files: [
        { path: 'index.html', contentBase64: Buffer.from(builtIndex).toString('base64') },
        { path: 'assets/app.js', contentBase64: Buffer.from(builtAsset).toString('base64') }
      ] });
    }
    if (url.endsWith('/sites') && options.method === 'POST') {
      return new Response(JSON.stringify({ id: 'site-1', ssl_url: 'https://site.netlify.app' }), { status: 201 });
    }
    if (url.endsWith('/sites/site-1/deploys') && options.method === 'POST') {
      return new Response(JSON.stringify({ id: 'deploy-1', state: 'uploading', ssl_url: 'https://site.netlify.app' }), { status: 201 });
    }
    if (url.includes('/files/') && options.method === 'PUT') {
      return new Response('', { status: 200 });
    }
    statusReads += 1;
    return new Response(JSON.stringify({ id: 'deploy-1', state: statusReads === 1 ? 'building' : 'ready', ssl_url: 'https://site.netlify.app' }), { status: 200 });
  };
  const normalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ files: [] }), { status: 200 });
  await assert.rejects(
    () => createNetlifyDeployment({ projectId: 'project-1', files: [{ path: 'index.html', content: 'ok' }] }),
    /worker response authentication failed/
  );
  console.log('TEST 2 PASS: Unsigned worker responses are rejected');
  globalThis.fetch = async (url) => url === process.env.NETLIFY_BUILD_WORKER_URL
    ? workerResponse({ files: [{ path: '../index.html', contentBase64: Buffer.from('unsafe').toString('base64') }] })
    : normalFetch(url);
  await assert.rejects(
    () => createNetlifyDeployment({ projectId: 'project-1', files: [{ path: 'index.html', content: 'ok' }] }),
    /unsafe file path/
  );
  console.log('TEST 3 PASS: Unsafe worker output paths are rejected');
  globalThis.fetch = normalFetch;

  const originalFetchForError = globalThis.fetch;
  globalThis.fetch = async (url) => url === process.env.NETLIFY_BUILD_WORKER_URL
    ? workerResponse({ files: [
        { path: 'index.html', contentBase64: Buffer.from(builtIndex).toString('base64') },
        { path: 'assets/app.js', contentBase64: Buffer.from(builtAsset).toString('base64') }
      ] })
    : new Response(JSON.stringify({ message: 'Site name already taken' }), { status: 422 });
  await assert.rejects(
    () => createNetlifyDeployment({
      projectId: 'project-1',
      files: [
        { path: 'package.json', content: JSON.stringify({ scripts: { build: 'node build.mjs' } }) },
        { path: 'build.mjs', content: "import { mkdir, writeFile } from 'node:fs/promises';\nawait mkdir('dist');\nawait writeFile('dist/index.html', 'ok');" }
      ]
    }),
    (error) => error.message.includes('POST /sites, HTTP 422') && error.message.includes('Site name already taken') && !error.message.includes('Authorization')
  );
  globalThis.fetch = originalFetchForError;

  const created = await createNetlifyDeployment({
    projectId: 'project-1',
    files: [
      { path: 'package.json', content: JSON.stringify({ scripts: { build: 'node build.mjs' } }) },
      {
        path: 'build.mjs',
        content: "import { mkdir, readFile, writeFile } from 'node:fs/promises';\nawait mkdir('dist/assets', { recursive: true });\nawait writeFile('dist/index.html', await readFile('index.html'));\nawait writeFile('dist/assets/app.js', 'console.log(\"built\")');"
      },
      { path: 'src/main.jsx', content: "import './index.css';" },
      { path: 'src/index.css', content: 'body { margin: 0; }' }
    ]
  });
  assert.equal(created.externalId, 'deploy-1');
  assert.equal(created.url, 'https://site.netlify.app');
  const deployRequest = requests.find(({ url, options }) => url.endsWith('/sites/site-1/deploys') && options.method === 'POST');
  const payload = JSON.parse(deployRequest.options.body);
  assert.equal(deployRequest.options.headers.Authorization, 'Bearer test-token');
  assert.equal(payload.files['index.html'], sha1(builtIndex));
  assert.equal(payload.files['assets/app.js'], sha1(builtAsset));
  assert.equal(payload.files['src/App.jsx'], undefined);
  assert.equal(payload.files['package.json'], undefined);
  assert.equal(requests.filter(({ options }) => options.method === 'PUT').length, 2);
  const uploadedPaths = requests.filter(({ options }) => options.method === 'PUT').map(({ url }) => url);
  assert.ok(uploadedPaths.some((url) => url.endsWith('/files/index.html')));
  console.log('TEST 4 PASS: Netlify site, manifest, and file upload');

  const completed = await waitForNetlifyDeployment('deploy-1', { maxAttempts: 3, intervalMs: 0 });
  assert.equal(completed.state, 'ready');
  console.log('TEST 5 PASS: Netlify deployment polling');
} finally {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.NETLIFY_TOKEN;
  else process.env.NETLIFY_TOKEN = originalToken;
  if (originalWorkerUrl === undefined) delete process.env.NETLIFY_BUILD_WORKER_URL;
  else process.env.NETLIFY_BUILD_WORKER_URL = originalWorkerUrl;
  if (originalWorkerSecret === undefined) delete process.env.NETLIFY_BUILD_WORKER_SECRET;
  else process.env.NETLIFY_BUILD_WORKER_SECRET = originalWorkerSecret;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
}

console.log('Netlify service tests passed.');
