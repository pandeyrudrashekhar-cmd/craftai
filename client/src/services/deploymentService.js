import api from './api';

// =========================
// Deployment APIs
// =========================

export const publishProject = (projectId) =>
  api
    .post(`/projects/${projectId}/deployments/publish`)
    .then(({ data }) => data.deployment);

export const deployToVercel = (projectId) =>
  api
    .post(`/projects/${projectId}/deployments/vercel`)
    .then(({ data }) => data.deployment);

export const deployToNetlify = (projectId) =>
  api
    .post(`/projects/${projectId}/deployments/netlify`)
    .then(({ data }) => data.deployment);

export const downloadProject = (projectId) =>
  api.get(`/projects/${projectId}/download`, { responseType: 'blob' });

export const fetchDeployments = (projectId) =>
  api
    .get(`/projects/${projectId}/deployments`)
    .then(({ data }) => data.deployments);

export const fetchDeployment = (projectId, deploymentId) =>
  api
    .get(`/projects/${projectId}/deployments/${deploymentId}`)
    .then(({ data }) => data.deployment);

export const deleteDeployment = (projectId, deploymentId) =>
  api.delete(
    `/projects/${projectId}/deployments/${deploymentId}`
  );


// =========================
// Custom Domain APIs
// =========================

// Add a custom domain to a deployment
export const addCustomDomain = (
  projectId,
  deploymentId,
  domain
) =>
  api
    .post(
      `/projects/${projectId}/deployments/${deploymentId}/domain`,
      { domain }
    )
    .then(({ data }) => data.customDomain);


// Get custom domain of a deployment
export const fetchCustomDomain = (
  projectId,
  deploymentId
) =>
  api
    .get(
      `/projects/${projectId}/deployments/${deploymentId}/domain`
    )
    .then(({ data }) => data.customDomain);


// Verify custom domain
export const verifyCustomDomain = (
  projectId,
  deploymentId
) =>
  api
    .post(
      `/projects/${projectId}/deployments/${deploymentId}/domain/verify`
    )
    .then(({ data }) => data.customDomain);


// Remove custom domain
export const deleteCustomDomain = (
  projectId,
  deploymentId
) =>
  api.delete(
    `/projects/${projectId}/deployments/${deploymentId}/domain`
  );