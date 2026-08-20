import axios from 'axios';
import { useAuthStore } from '../store/authStore.js';

// Get Vite environment variables
const viteEnv = typeof import.meta !== 'undefined'
  ? import.meta.env
  : undefined;

// Get API URL from environment variable
const configuredApiUrl = viteEnv?.VITE_API_URL?.trim();

// Production backend URL
const productionApiUrl =
  'https://craftai-backend-dy44.onrender.com/api';

// Check whether the configured URL is localhost
const isLocalApiUrl =
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(
    configuredApiUrl ?? ''
  );

// --------------------------------------------------
// Decide API Base URL
// --------------------------------------------------

let apiBaseUrl;

if (viteEnv?.PROD) {
  // Production

  if (!configuredApiUrl || isLocalApiUrl) {
    // If VITE_API_URL is missing or points to localhost,
    // use the production backend.
    apiBaseUrl = productionApiUrl;
  } else {
    // If VITE_API_URL is provided,
    // make sure /api is present.
    apiBaseUrl = configuredApiUrl.replace(/\/+$/, '');

    if (!apiBaseUrl.endsWith('/api')) {
      apiBaseUrl += '/api';
    }
  }
} else {
  // Local development
  apiBaseUrl = configuredApiUrl || productionApiUrl;
}

// --------------------------------------------------
// Axios instance
// --------------------------------------------------

const api = axios.create({
  baseURL: apiBaseUrl,

  headers: {
    'Content-Type': 'application/json'
  }
});

// --------------------------------------------------
// Add JWT token to every request
// --------------------------------------------------

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// --------------------------------------------------
// Handle API responses / errors
// --------------------------------------------------

api.interceptors.response.use(
  (response) => response,

  (error) => {
    // If token is expired/invalid
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