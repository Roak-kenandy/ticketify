import axios from 'axios';
import { AdminAuth } from './admin-auth';

const baseURL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3333/api/v1';

const axiosInterceptorInstance = axios.create({
  baseURL,
});

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
