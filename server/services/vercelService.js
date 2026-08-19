import { AppError } from '../utils/appError.js';

const VERCEL_API_URL = 'https://api.vercel.com';
const terminalStates = new Set(['READY', 'ERROR', 'CANCELED']);

function getToken() {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    throw new AppError('Vercel deployment is not configured. Set VERCEL_TOKEN on the server.', 503);
  }
  return token;
}

async function requestVercel(path, options = {}) {
  const response = await fetch(`${VERCEL_API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.error?.message || body.message || `Vercel returned HTTP ${response.status}.`;
    throw new AppError(`Vercel deployment failed: ${message}`, response.status >= 500 ? 502 : 400);
  }

  return body;
}

function getDeploymentId(deployment) {
  return deployment.id || deployment.uid;
}

function getDeploymentUrl(deployment) {
  if (!deployment.url) return null;
  return deployment.url.startsWith('http') ? deployment.url : `https://${deployment.url}`;
}

function ensureViteEntryFile(files) {
  if (files.some((file) => file.path === 'index.html')) return files;
  if (!files.some((file) => file.path === 'src/main.jsx')) return files;

  return [{
    path: 'index.html',
    content: '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>CraftAI Website</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.jsx"></script>\n  </body>\n</html>\n'
  }, ...files];
}

export function assertVercelConfigured() {
  getToken();
}

export async function createVercelDeployment({ projectId, files }) {
  const deploymentFiles = ensureViteEntryFile(files);
  const deployment = await requestVercel('/v13/deployments', {
    method: 'POST',
    body: JSON.stringify({
      name: `craftai-${projectId}`,
      projectSettings: { framework: 'vite' },
      files: deploymentFiles.map((file) => ({ file: file.path, data: file.content }))
    })
  });

  const externalId = getDeploymentId(deployment);
  if (!externalId) {
    throw new AppError('Vercel did not return a deployment ID.', 502);
  }

  return {
    externalId,
    url: getDeploymentUrl(deployment),
    readyState: deployment.readyState || deployment.status || 'BUILDING',
    errorMessage: deployment.error?.message || deployment.errorMessage || null
  };
}

export async function getVercelDeployment(externalId) {
  const deployment = await requestVercel(`/v13/deployments/${encodeURIComponent(externalId)}`);
  return {
    externalId: getDeploymentId(deployment) || externalId,
    url: getDeploymentUrl(deployment),
    readyState: deployment.readyState || deployment.status || 'BUILDING',
    errorMessage: deployment.error?.message || deployment.errorMessage || null
  };
}

export async function waitForVercelDeployment(externalId, { maxAttempts = 40, intervalMs = 1500 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const deployment = await getVercelDeployment(externalId);
    if (terminalStates.has(deployment.readyState)) return deployment;
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new AppError('Vercel deployment timed out while waiting for a ready state.', 504);
}
