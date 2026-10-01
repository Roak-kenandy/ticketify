import axios from 'axios';
import { AdminAuth } from './admin-auth';

const baseURL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3333/api/v1';

export const DEFAULT_TIMEOUT_MS = 30_000;
/** Report queries and exports aggregate large CRM datasets. */
export const REPORT_TIMEOUT_MS = 180_000;

const axiosInterceptorInstance = axios.create({
  baseURL,
  timeout: DEFAULT_TIMEOUT_MS,
});

/** User-facing message for a failed request: server message, timeout, or offline. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return 'The server is taking too long to respond. Please try again.';
    }
    if (!error.response) {
      return 'Can’t reach the server. Check your connection.';
    }
    const message = (error.response.data as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string' && message.trim()) return message;
    if (Array.isArray(message) && message.length) return String(message[0]);
  }
  return fallback;
}

axiosInterceptorInstance.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const accessToken = AdminAuth.getToken();
      if (accessToken && config.headers) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

axiosInterceptorInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const requestUrl = String(error.config?.url ?? '');
      const isLoginRequest = requestUrl.includes('/auth/login');
      const onLoginPage = window.location.pathname.startsWith('/auth/login');

      if (!isLoginRequest && !onLoginPage) {
        AdminAuth.logout();
      }
    }
    return Promise.reject(error);
  },
);

export default axiosInterceptorInstance;
