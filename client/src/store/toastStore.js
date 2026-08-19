import { create } from 'zustand';
const id = () => crypto.randomUUID();
export const useToastStore = create((set) => ({
  toasts: [],
  addToast: (message, type = 'success') => { const toast = { id: id(), message, type }; set((state) => ({ toasts: [...state.toasts, toast] })); window.setTimeout(() => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== toast.id) })), 4000); },
  removeToast: (toastId) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== toastId) }))
}));
