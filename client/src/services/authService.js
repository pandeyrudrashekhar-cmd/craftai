import api from './api';
export const login = (credentials) => api.post('/auth/login', credentials).then(({ data }) => data);
export const signup = (credentials) => api.post('/auth/signup', credentials).then(({ data }) => data);
export const startGitHubConnection = () => api.get('/github/connect').then(({ data }) => data.authorizationUrl);
export const fetchGitHubStatus = () => api.get('/github/status').then(({ data }) => data);
