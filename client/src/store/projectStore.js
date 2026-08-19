import { create } from 'zustand';
import * as projectService from '../services/projectService';

const errorMessage = (error) => error.response?.data?.error ?? 'Something went wrong. Please try again.';
export const useProjectStore = create((set, get) => ({
  projects: [], loading: false, error: null, selectedProject: null, searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  clearError: () => set({ error: null }),
  loadProjects: async () => { set({ loading: true, error: null }); try { set({ projects: await projectService.fetchProjects() }); } catch (error) { set({ error: errorMessage(error) }); } finally { set({ loading: false }); } },
  createProject: async (payload) => { const project = await projectService.createProject(payload); set({ projects: [project, ...get().projects] }); return project; },
  updateProject: async (id, payload) => { const project = await projectService.updateProject(id, payload); set({ projects: get().projects.map((item) => item.id === id ? project : item), selectedProject: get().selectedProject?.id === id ? project : get().selectedProject }); return project; },
  deleteProject: async (id) => { await projectService.deleteProject(id); set({ projects: get().projects.filter((item) => item.id !== id), selectedProject: get().selectedProject?.id === id ? null : get().selectedProject }); },
  loadProject: async (id) => { const project = await projectService.fetchProject(id); set({ selectedProject: project }); return project; }
}));
