import { createHash } from 'node:crypto';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../utils/appError.js';
import { limits } from '../config/limits.js';

const NETLIFY_API_URL = 'https://api.netlify.com/api/v1';
const terminalStates = new Set(['ready', 'error']);
const WORKER_TIMEOUT_MS = 120000;
function getToken() {
  const token = process.env.NETLIFY_TOKEN?.trim();
  if (!token) {
    throw new AppError('Netlify deployment is not configured. Set NETLIFY_TOKEN on the server.', 503);
  }
  return token;
}

async function requestNetlify(path, options = {}) {
  const method = options.method || 'GET';
  const requestBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
  const response = await fetch(`${NETLIFY_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.message || body.error || `Netlify returned HTTP ${response.status}.`;
    const requestSummary = requestBody === undefined ? '' : ` Request payload: ${JSON.stringify(requestBody)}`;
    throw new AppError(`Netlify deployment failed: ${message} [${method} ${path}, HTTP ${response.status}.${requestSummary} Response: ${JSON.stringify(body)}]`, response.status >= 500 ? 502 : 400);
  }

  return body;
}

function fileHash(content) {
  return createHash('sha1').update(content).digest('hex');
}

function getBuildWorkerConfig() {
  const workerUrl = process.env.NETLIFY_BUILD_WORKER_URL?.trim();
  if (!workerUrl) throw new AppError('Netlify deployment requires an isolated build worker. Configure NETLIFY_BUILD_WORKER_URL before enabling this provider.', 503);
  let parsedUrl;
  try {
    parsedUrl = new URL(workerUrl);
  } catch {
    throw new AppError('Netlify build worker URL is invalid.', 503);
  }
  if (parsedUrl.username || parsedUrl.password || (parsedUrl.protocol !== 'https:' && process.env.NODE_ENV !== 'test')) {
    throw new AppError('Netlify build worker URL must use HTTPS.', 503);
  }
  const secret = process.env.NETLIFY_BUILD_WORKER_SECRET?.trim();
  if (!secret) throw new AppError('Netlify build worker authentication is not configured.', 503);
  return { workerUrl: parsedUrl.toString(), secret };
}

function isSafeBuildPath(path) {
  return typeof path === 'string'
    && path.length > 0
    && path.length <= 255
    && !path.startsWith('/')
    && !path.includes('\\')
    && !path.split('/').some((part) => !part || part === '.' || part === '..');
}

function signWorkerPayload(secret, timestamp, payload) {
  return createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
}

function hasValidSignature(secret, timestamp, payload, signature) {
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000 || typeof signature !== 'string') return false;
  const expected = signWorkerPayload(secret, timestamp, payload);
  const actualBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

async function buildNetlifyFiles(files, projectId) {
  const { workerUrl, secret } = getBuildWorkerConfig();
  const inputBytes = files.reduce((total, file) => total + Buffer.byteLength(String(file.content), 'utf8'), 0);
  if (files.length > limits.maxProjectFiles || inputBytes > limits.maxProjectBytes) {
    throw new AppError('Netlify build input exceeds the configured project limits.', 413);
  }
  const stagedFiles = files.map((file) => ({
    path: file.path,
    contentBase64: Buffer.from(String(file.content), 'utf8').toString('base64')
  }));
  const payload = JSON.stringify({ projectId, files: stagedFiles });
  const timestamp = String(Date.now());
  let response;
  try {
    response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CraftAI-Worker-Timestamp': timestamp,
        'X-CraftAI-Worker-Signature': signWorkerPayload(secret, timestamp, payload)
      },
      body: payload,
      signal: AbortSignal.timeout(WORKER_TIMEOUT_MS)
    });
  } catch (error) {
    throw new AppError(`Netlify isolated build worker is unavailable: ${error.message}`, 502);
  }

  const body = await response.json().catch(() => null);
  const responseTimestamp = response.headers.get('X-CraftAI-Worker-Timestamp');
  const responseSignature = response.headers.get('X-CraftAI-Worker-Signature');
  const responsePayload = JSON.stringify(body);
  if (!responseTimestamp || !hasValidSignature(secret, responseTimestamp, responsePayload, responseSignature)) {
    throw new AppError('Netlify isolated build worker response authentication failed.', 502);
  }
  if (!response.ok || !Array.isArray(body?.files)) {
    throw new AppError(body?.error || 'Netlify isolated build worker returned an invalid response.', 502);
  }
  if (body.files.length > limits.maxBuildOutputFiles) throw new AppError('Netlify build output exceeds the configured file limit.', 502);
  const outputFiles = body.files.map((file) => {
    if (typeof file?.path !== 'string' || typeof file?.contentBase64 !== 'string') {
      throw new AppError('Netlify isolated build worker returned an invalid file.', 502);
    }
    if (!isSafeBuildPath(file.path)) throw new AppError('Netlify isolated build worker returned an unsafe file path.', 502);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.contentBase64)) throw new AppError('Netlify isolated build worker returned invalid file content.', 502);
    return { path: file.path, content: Buffer.from(file.contentBase64, 'base64') };
  });
  if (new Set(outputFiles.map((file) => file.path)).size !== outputFiles.length) throw new AppError('Netlify isolated build worker returned duplicate file paths.', 502);
  if (outputFiles.reduce((total, file) => total + file.content.length, 0) > limits.maxBuildOutputBytes) throw new AppError('Netlify build output exceeds the configured size limit.', 502);
  return outputFiles;
}

function getDeploymentUrl(deployment) {
  return deployment.ssl_url || deployment.url || (deployment.subdomain ? `https://${deployment.subdomain}.netlify.app` : null);
}

export function assertNetlifyConfigured() {
  getToken();
}

export async function createNetlifyDeployment({ projectId, files }) {
  const deploymentFiles = await buildNetlifyFiles(files, projectId);
  const site = await requestNetlify('/sites', {
    method: 'POST',
    body: JSON.stringify({})
  });
  const manifest = Object.fromEntries(deploymentFiles.map((file) => [file.path, fileHash(file.content)]));
  const deploy = await requestNetlify(`/sites/${encodeURIComponent(site.id)}/deploys`, {
    method: 'POST',
    body: JSON.stringify({ files: manifest })
  });

  for (const file of deploymentFiles) {
    await requestNetlify(`/deploys/${encodeURIComponent(deploy.id)}/files/${file.path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file.content
    });
  }

  return {
    externalId: deploy.id,
    url: getDeploymentUrl(deploy) || getDeploymentUrl(site),
    state: deploy.state || 'uploading',
    errorMessage: deploy.error_message || deploy.errorMessage || null
  };
}

export async function getNetlifyDeployment(externalId) {
  const deploy = await requestNetlify(`/deploys/${encodeURIComponent(externalId)}`);
  return {
    externalId: deploy.id || externalId,
    url: getDeploymentUrl(deploy),
    state: deploy.state || 'building',
    errorMessage: deploy.error_message || deploy.errorMessage || null
  };
}

export async function waitForNetlifyDeployment(externalId, { maxAttempts = 40, intervalMs = 1500 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const deployment = await getNetlifyDeployment(externalId);
    if (terminalStates.has(deployment.state)) return deployment;
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new AppError('Netlify deployment timed out while waiting for a ready state.', 504);
}
