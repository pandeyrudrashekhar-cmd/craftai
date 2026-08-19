import assert from 'node:assert/strict';
import { assertVercelConfigured, createVercelDeployment, waitForVercelDeployment } from '../services/vercelService.js';

const originalToken = process.env.VERCEL_TOKEN;
const originalFetch = globalThis.fetch;

try {
  delete process.env.VERCEL_TOKEN;
  assert.throws(
    () => assertVercelConfigured(),
    /Set VERCEL_TOKEN on the server/
  );
  console.log('TEST 1 PASS: Missing Vercel token is reported clearly');

  process.env.VERCEL_TOKEN = 'test-token';
  const requests = [];
  let statusReads = 0;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/v13/deployments') && options.method === 'POST') {
      return new Response(JSON.stringify({ id: 'vercel-1', url: 'example.vercel.app', readyState: 'BUILDING' }), { status: 200 });
    }
    statusReads += 1;
    return new Response(JSON.stringify({ id: 'vercel-1', url: 'example.vercel.app', readyState: statusReads === 1 ? 'BUILDING' : 'READY' }), { status: 200 });
  };

  const created = await createVercelDeployment({
    projectId: 'project-1',
    files: [{ path: 'src/main.jsx', content: "import App from './App.jsx';" }]
  });
  assert.equal(created.externalId, 'vercel-1');
  assert.equal(created.url, 'https://example.vercel.app');
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token');
  assert.deepEqual(payload.projectSettings, { framework: 'vite' });
  assert.deepEqual(payload.files, [
    { file: 'index.html', data: '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>CraftAI Website</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n' },
    { file: 'src/main.jsx', data: "import App from './App.jsx';" }
  ]);
  console.log('TEST 2 PASS: Vercel deployment payload and server token');

  const completed = await waitForVercelDeployment('vercel-1', { maxAttempts: 3, intervalMs: 0 });
  assert.equal(completed.readyState, 'READY');
  console.log('TEST 3 PASS: Vercel deployment polling');
} finally {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.VERCEL_TOKEN;
  else process.env.VERCEL_TOKEN = originalToken;
}

console.log('Vercel service tests passed.');
