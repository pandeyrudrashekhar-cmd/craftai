import api from './api';

export const fetchGitHubRepositories = (params = {}) =>
  api.get('/github/repositories', { params }).then(({ data }) => data.repositories);

export const fetchGitHubRepositoryBranches = (owner, repo, params = {}) =>
  api.get(`/github/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`, { params })
    .then(({ data }) => data.branches);

export const pushProjectToGitHub = (owner, repo, payload) =>
  api.post(`/github/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/push`, payload)
    .then(({ data }) => data);