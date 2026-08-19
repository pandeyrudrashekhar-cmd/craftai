import api from './api';

export const fetchProjects = () => api.get('/projects').then(({ data }) => data.projects);
export const fetchProject = (projectId) => api.get(`/projects/${projectId}`).then(({ data }) => data.project);
export const createProject = (payload) => api.post('/projects', payload).then(({ data }) => data.project);
export const updateProject = (projectId, payload) => api.patch(`/projects/${projectId}`, payload).then(({ data }) => data.project);
export const deleteProject = (projectId) => api.delete(`/projects/${projectId}`);
