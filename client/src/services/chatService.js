import api from './api.js';
export const fetchChat = (projectId) => api.get(`/projects/${projectId}/chat`).then(({ data }) => data.conversation);
export const sendChatMessage = (projectId, message) => api.post(`/projects/${projectId}/chat`, { message }).then(({ data }) => data);
