import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(persist((set) => ({
  token: null, user: null, githubUsername: null,
  authenticate: ({ token, user }) => set({ token, user }),
  setGitHubUsername: (githubUsername) => set({ githubUsername }),
  logout: () => set({ token: null, user: null, githubUsername: null })
}), { name: 'craftai-auth', partialize: ({ token, user, githubUsername }) => ({ token, user, githubUsername }) }));
