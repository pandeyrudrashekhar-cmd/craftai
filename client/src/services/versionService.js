import api from './api';

export const createVersion = (projectId, payload) =>
  api.post(`/projects/${projectId}/versions`, payload).then(({ data }) => data.version);

export const fetchVersions = (projectId) =>
  api.get(`/projects/${projectId}/versions`).then(({ data }) => data.versions);

export const fetchVersion = (projectId, versionId) =>
  api.get(`/projects/${projectId}/versions/${versionId}`).then(({ data }) => data.version);

export const restoreVersion = (projectId, versionId) =>
  api.post(`/projects/${projectId}/versions/${versionId}/restore`).then(({ data }) => data.files);

export const deleteVersion = (projectId, versionId) =>
  api.delete(`/projects/${projectId}/versions/${versionId}`);
