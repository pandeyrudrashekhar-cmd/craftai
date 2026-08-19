import api from './api.js';

export const fetchFiles = (projectId) => api.get(`/projects/${projectId}/files`).then(({ data }) => data.files);
export const fetchFile = (projectId, fileId) => api.get(`/projects/${projectId}/files/${fileId}`).then(({ data }) => data.file);
export const createFile = (projectId, payload) => api.post(`/projects/${projectId}/files`, payload).then(({ data }) => data.file);
export const updateFile = (projectId, fileId, content) => api.put(`/projects/${projectId}/files/${fileId}`, { content }).then(({ data }) => data.file);
export const deleteFile = (projectId, fileId) => api.delete(`/projects/${projectId}/files/${fileId}`);
export const initializeFiles = (projectId) => api.post(`/projects/${projectId}/files/initialize`).then(({ data }) => data.files);
