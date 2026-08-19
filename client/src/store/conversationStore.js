import { create } from 'zustand';
import * as chatService from '../services/chatService.js';
import { useFileStore } from './fileStore.js';

const getErrorMessage = (error) => error.response?.data?.error ?? 'Unable to reach the AI assistant. Please try again.';

export function buildAssistantMessage(result) {
  const message = result?.message ?? {};
  return {
    ...message,
    changes: Array.isArray(result?.changes) ? result.changes : [],
    editing: Boolean(result?.editing)
  };
}

export const useConversationStore = create((set, get) => ({
  currentConversation: null, messages: [], loading: false, sending: false, error: null, activeProjectId: null, requestVersion: 0,
  clearConversation: () => set((state) => ({ currentConversation: null, messages: [], loading: false, sending: false, error: null, activeProjectId: null, requestVersion: state.requestVersion + 1 })),
  fetchMessages: async (projectId) => { const requestVersion = get().requestVersion + 1; set({ loading: true, error: null, activeProjectId: projectId, requestVersion }); try { const conversation = await chatService.fetchChat(projectId); if (get().activeProjectId !== projectId || get().requestVersion !== requestVersion) return; set({ currentConversation: conversation.id, messages: conversation.messages }); } catch (error) { if (get().activeProjectId === projectId && get().requestVersion === requestVersion) set({ error: getErrorMessage(error), messages: [] }); } finally { if (get().activeProjectId === projectId && get().requestVersion === requestVersion) set({ loading: false }); } },
  sendMessage: async (projectId, content) => {
    const requestVersion = get().requestVersion;
    const optimisticId = crypto.randomUUID(); const optimisticMessage = { id: optimisticId, role: 'user', content, createdAt: new Date().toISOString(), pending: true };
    set((state) => ({ messages: [...state.messages, optimisticMessage], sending: true, error: null }));
    try {
      const result = await chatService.sendChatMessage(projectId, content);
      if (get().activeProjectId !== projectId || get().requestVersion !== requestVersion) return null;
      if (result.files?.length) useFileStore.getState().applyFiles(result.files);
      const assistantMessage = buildAssistantMessage(result);
      set((state) => ({
        currentConversation: result.conversationId,
        messages: [...state.messages.map((message) => message.id === optimisticId ? result.userMessage : message), assistantMessage]
      }));
      return assistantMessage;
    } catch (error) {
      if (get().activeProjectId !== projectId || get().requestVersion !== requestVersion) throw error;
      const fileStore = useFileStore.getState();
      const reloadedFiles = await fileStore.loadFiles(projectId);
      if (fileStore.selectedFile && reloadedFiles.some((file) => file.id === fileStore.selectedFile.id)) await fileStore.selectFile(projectId, fileStore.selectedFile.id);
      set((state) => ({ messages: state.messages.map((message) => message.id === optimisticId ? { ...message, pending: false, failed: true } : message), error: getErrorMessage(error) }));
      throw error;
    } finally { if (get().activeProjectId === projectId && get().requestVersion === requestVersion) set({ sending: false }); }
  },
  retryMessage: async (projectId, message) => { set((state) => ({ messages: state.messages.filter((item) => item.id !== message.id) })); return get().sendMessage(projectId, message.content); }
}));
