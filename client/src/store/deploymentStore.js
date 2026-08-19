import { create } from 'zustand';
import * as deploymentService from '../services/deploymentService';

const errorMessage = (error) => error.response?.data?.error ?? 'Something went wrong. Please try again.';
const pollingDeployments = new Set();

const pollDeployment = async (projectId, deploymentId, set, get) => {
  if (pollingDeployments.has(deploymentId)) return;
  pollingDeployments.add(deploymentId);

  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const deployments = await deploymentService.fetchDeployments(projectId);
      if (get().activeProjectId !== projectId) break;
      set({ deployments });
      const deployment = deployments.find((item) => item.id === deploymentId);
      if (!deployment || ['READY', 'FAILED'].includes(deployment.status)) break;
    }
  } catch (error) {
    if (get().activeProjectId === projectId) set({ error: errorMessage(error) });
  } finally {
    pollingDeployments.delete(deploymentId);
  }
};

export const useDeploymentStore = create((set, get) => ({
  deployments: [],
  activeProjectId: null,
  requestVersion: 0,
  customDomain: null,
  loading: false,
  vercelSubmitting: false,
  netlifySubmitting: false,
  customDomainLoading: false,
  error: null,

  clearDeployments: () => set((state) => ({ deployments: [], customDomain: null, activeProjectId: null, loading: false, vercelSubmitting: false, netlifySubmitting: false, customDomainLoading: false, error: null, requestVersion: state.requestVersion + 1 })),

  clearError: () => set({ error: null }),

  loadDeployments: async (projectId) => {
    const requestVersion = get().requestVersion + 1;
    set({ loading: true, error: null, activeProjectId: projectId, requestVersion });
    try {
      const deployments = await deploymentService.fetchDeployments(projectId);
      if (get().activeProjectId !== projectId || get().requestVersion !== requestVersion) return [];
      set({ deployments });
      deployments
        .filter((deployment) => ['VERCEL', 'NETLIFY'].includes(deployment.provider) && deployment.status === 'BUILDING')
        .forEach((deployment) => pollDeployment(projectId, deployment.id, set, get));
    } catch (error) {
      if (get().activeProjectId === projectId && get().requestVersion === requestVersion) set({ error: errorMessage(error) });
    } finally {
      if (get().activeProjectId === projectId && get().requestVersion === requestVersion) set({ loading: false });
    }
  },

  publishProject: async (projectId) => {
    try {
      const deployment = await deploymentService.publishProject(projectId);
      if (get().activeProjectId !== projectId) return deployment;
      set({ deployments: [deployment, ...get().deployments.filter((item) => item.id !== deployment.id)] });
      return deployment;
    } catch (error) {
      if (get().activeProjectId === projectId) set({ error: errorMessage(error) });
      throw error;
    }
  },

  deployToVercel: async (projectId) => {
    set({ vercelSubmitting: true });
    try {
      const deployment = await deploymentService.deployToVercel(projectId);
      if (get().activeProjectId !== projectId) return deployment;
      set({ deployments: [deployment, ...get().deployments] });
      pollDeployment(projectId, deployment.id, set, get);
      return deployment;
    } catch (error) {
      if (get().activeProjectId === projectId) set({ error: errorMessage(error) });
      throw error;
    } finally {
      if (get().activeProjectId === projectId) set({ vercelSubmitting: false });
    }
  },

  deployToNetlify: async (projectId) => {
    set({ netlifySubmitting: true });
    try {
      const deployment = await deploymentService.deployToNetlify(projectId);
      if (get().activeProjectId !== projectId) return deployment;
      set({ deployments: [deployment, ...get().deployments] });
      pollDeployment(projectId, deployment.id, set, get);
      return deployment;
    } catch (error) {
      if (get().activeProjectId === projectId) set({ error: errorMessage(error) });
      throw error;
    } finally {
      if (get().activeProjectId === projectId) set({ netlifySubmitting: false });
    }
  },

  deleteDeployment: async (projectId, deploymentId) => {
    try {
      await deploymentService.deleteDeployment(projectId, deploymentId);
      if (get().activeProjectId !== projectId) return;
      set({ deployments: get().deployments.filter((d) => d.id !== deploymentId) });
      if (get().customDomain?.deploymentId === deploymentId) {
        set({ customDomain: null });
      }
    } catch (error) {
      if (get().activeProjectId === projectId) set({ error: errorMessage(error) });
      throw error;
    }
  },

  fetchCustomDomain: async (projectId, deploymentId) => {
    set({ customDomainLoading: true, error: null });
    try {
      const customDomain = await deploymentService.fetchCustomDomain(projectId, deploymentId);
      if (get().activeProjectId !== projectId) return customDomain;
      set({ customDomain });
      return customDomain;
    } catch (error) {
      if (error.response?.status === 404) {
        if (get().activeProjectId === projectId) set({ customDomain: null });
        return null;
      }

      if (get().activeProjectId === projectId) set({ error: errorMessage(error) });
      throw error;
    } finally {
      if (get().activeProjectId === projectId) set({ customDomainLoading: false });
    }
  },

  connectCustomDomain: async (projectId, deploymentId, domain) => {
    try {
      const customDomain = await deploymentService.addCustomDomain(projectId, deploymentId, domain);
      if (get().activeProjectId !== projectId) return customDomain;
      set({ customDomain });
      return customDomain;
    } catch (error) {
      if (get().activeProjectId === projectId) set({ error: errorMessage(error) });
      throw error;
    }
  },

  verifyCustomDomain: async (projectId, deploymentId) => {
    try {
      const customDomain = await deploymentService.verifyCustomDomain(projectId, deploymentId);
      if (get().activeProjectId !== projectId) return customDomain;
      set({ customDomain });
      return customDomain;
    } catch (error) {
      if (get().activeProjectId === projectId) set({ error: errorMessage(error) });
      throw error;
    }
  },

  deleteCustomDomain: async (projectId, deploymentId) => {
    try {
      await deploymentService.deleteCustomDomain(projectId, deploymentId);
      if (get().activeProjectId !== projectId) return;
      set({ customDomain: null });
    } catch (error) {
      if (get().activeProjectId === projectId) set({ error: errorMessage(error) });
      throw error;
    }
  }
}));
