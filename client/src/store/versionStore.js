import { create } from 'zustand';
import * as versionService from '../services/versionService';

const errorMessage = (error) => error.response?.data?.error ?? 'Something went wrong. Please try again.';

export const useVersionStore = create((set, get) => ({
  versions: [],
  loading: false,
  error: null,
  activeProjectId: null,
  requestVersion: 0,

  clearVersions: () => set((state) => ({
    versions: [],
    loading: false,
    error: null,
    activeProjectId: null,
    requestVersion: state.requestVersion + 1
  })),

  clearError: () => set({ error: null }),

  loadVersions: async (projectId) => {
    const requestVersion = get().requestVersion + 1;
    set({ loading: true, error: null, activeProjectId: projectId, requestVersion });
    try {
      const versions = await versionService.fetchVersions(projectId);
      if (get().activeProjectId !== projectId || get().requestVersion !== requestVersion) return [];
      set({ versions });
      return versions;
    } catch (error) {
      if (get().activeProjectId === projectId && get().requestVersion === requestVersion) set({ error: errorMessage(error) });
      return [];
    } finally {
      if (get().activeProjectId === projectId && get().requestVersion === requestVersion) set({ loading: false });
    }
  },

  createVersion: async (projectId, payload) => {
    try {
      const version = await versionService.createVersion(projectId, payload);
      if (get().activeProjectId !== projectId) return version;
      set({ versions: [version, ...get().versions] });
      return version;
    } catch (error) {
      if (get().activeProjectId === projectId) set({ error: errorMessage(error) });
      throw error;
    }
  },

  getVersion: async (projectId, versionId) => {
    try {
      return await versionService.fetchVersion(projectId, versionId);
    } catch (error) {
      if (get().activeProjectId === projectId) set({ error: errorMessage(error) });
      throw error;
    }
  },

  restoreVersion: async (projectId, versionId) => {
    try {
      const files = await versionService.restoreVersion(projectId, versionId);
      return files;
    } catch (error) {
      if (get().activeProjectId === projectId) set({ error: errorMessage(error) });
      throw error;
    }
  },

  deleteVersion: async (projectId, versionId) => {
    try {
      await versionService.deleteVersion(projectId, versionId);
      if (get().activeProjectId !== projectId) return;
      set({ versions: get().versions.filter((v) => v.id !== versionId) });
    } catch (error) {
      if (get().activeProjectId === projectId) set({ error: errorMessage(error) });
      throw error;
    }
  }
}));
