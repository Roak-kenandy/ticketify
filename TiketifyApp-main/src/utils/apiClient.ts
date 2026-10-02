import {API_BASE_URL} from '../config/api';
import {trackApiLoading} from './apiLoading';

const DEFAULT_TIMEOUT_MS = 20000;

export const NETWORK_ERROR_MESSAGE =
  "Can't reach the server. Check your internet connection and try again.";
export const TIMEOUT_ERROR_MESSAGE =
  'The server is taking too long to respond. Please try again.';

export type ApiRequestInit = RequestInit & {
  /** Abort the request after this many milliseconds (default 20s). */
  timeoutMs?: number;
  /** Skip the global activity indicator (background syncs, polling). */
  silent?: boolean;
};

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Fired when an authenticated request comes back 401 (expired/revoked token). */
export function subscribeUnauthorized(listener: UnauthorizedListener) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function emitUnauthorized() {
  unauthorizedListeners.forEach(listener => {
    try {
      listener();
    } catch {
      // A failing listener must not break the request chain.
    }
  });
}

export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return true;
    }
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64));
    if (!payload.exp) {
      return false;
    }
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function normalizeAvailability(value: unknown): boolean {
  if (value === true || value === 'AVAILABLE') {
    return true;
  }
  if (value === false || value === 'UNAVAILABLE' || value === 'OFFLINE') {
    return false;
  }
  return Boolean(value);
}

export async function parseJsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(
      response.ok
        ? 'Invalid server response'
        : `Request failed (${response.status})`,
      response.status,
    );
  }
}

export function isNetworkError(error: any): boolean {
  return error instanceof ApiError && error.status === 0;
}

export async function apiFetch(
  path: string,
  token: string | null | undefined,
  init: ApiRequestInit = {},
): Promise<{data: any; response: Response}> {
  const {timeoutMs = DEFAULT_TIMEOUT_MS, silent, ...requestInit} = init;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(requestInit.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const run = async () => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...requestInit,
        headers,
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(
        timedOut ? TIMEOUT_ERROR_MESSAGE : NETWORK_ERROR_MESSAGE,
        0,
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401 && token) {
      emitUnauthorized();
    }
    const data = await parseJsonResponse(response);
    return {data, response};
  };

  return silent ? run() : trackApiLoading(run());
}

export const SERVER_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export function formatApiError(data: any, fallback = 'Request failed'): string {
  const status = Number(data?.statusCode);
  if (status >= 500) {
    return SERVER_ERROR_MESSAGE;
  }
  const message = data?.message ?? data?.error ?? fallback;
  const text = Array.isArray(message) ? String(message[0]) : String(message);
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

/** JSON request that throws ApiError on any non-2xx response. */
export async function apiRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  token: string | null | undefined,
  body?: unknown,
  options: Omit<ApiRequestInit, 'method' | 'body'> = {},
) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (body !== undefined && !isForm) {
    headers['Content-Type'] = 'application/json';
  }
  const {data, response} = await apiFetch(path, token, {
    ...options,
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : isForm
        ? (body as FormData)
        : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError(
      formatApiError(data, `Request failed (${response.status})`),
      response.status,
      data,
    );
  }
  return data;
}

export function apiGet(
  path: string,
  token: string | null | undefined,
  options?: Omit<ApiRequestInit, 'method' | 'body'>,
) {
  return apiRequest('GET', path, token, undefined, options);
}

export function apiPost(
  path: string,
  body: object,
  token?: string | null,
  options?: Omit<ApiRequestInit, 'method' | 'body'>,
) {
  return apiRequest('POST', path, token, body, options);
}

export function apiPut(
  path: string,
  body: object | undefined,
  token: string | null | undefined,
  options?: Omit<ApiRequestInit, 'method' | 'body'>,
) {
  return apiRequest('PUT', path, token, body ?? {}, options);
}

export function apiPatch(
  path: string,
  body: object,
  token: string | null | undefined,
  options?: Omit<ApiRequestInit, 'method' | 'body'>,
) {
  return apiRequest('PATCH', path, token, body, options);
}

/** Authenticated URL + headers for an Image source served through the API. */
export function fileImageSource(fileId: string | undefined, token?: string) {
  if (!fileId) {
    return undefined;
  }
  return {
    uri: `${API_BASE_URL}/tickets/files/${encodeURIComponent(fileId)}`,
    headers: token ? {Authorization: `Bearer ${token}`} : undefined,
  };
}
