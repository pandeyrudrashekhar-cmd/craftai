import axios from 'axios';
import { useAuthStore } from '../store/authStore.js';

const viteEnv = typeof import.meta !== 'undefined' ? import.meta.env : undefined;

const api = axios.create({
  // Local development:
  // VITE_API_URL from .env will be used.
  //
  // Production:
  // If VITE_API_URL is not available on Render,
  // the live backend URL will be used.
  baseURL:
    viteEnv?.VITE_API_URL ??
    'https://craftai-backend-dy44.onrender.com/api',

  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,

  (error) => {
    if (error.response?.status === 401) {
      const auth = useAuthStore.getState();

      if (auth.token) {
        auth.logout();
      }

      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/login') &&
        !window.location.pathname.startsWith('/signup')
      ) {
        window.location.assign('/login');
      }
    }

    const message =
      error.response?.data?.error || 'Request failed.';

    throw {
      ...error,
      response: {
        ...error.response,
        data: {
          ...error.response?.data,
          error: message
        }
      }
    };
  }
);

export default api;