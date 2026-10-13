export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3333/api/v1"
).replace(/\/+$/, "");

const DEFAULT_TIMEOUT_MS = 20000;

export const NETWORK_ERROR_MESSAGE =
  "Can't reach the server. Check your internet connection and try again.";
export const TIMEOUT_ERROR_MESSAGE =
  "The server is taking too long to respond. Please try again.";
export const SERVER_ERROR_MESSAGE = "Something went wrong. Please try again.";

export type ApiOptions = {
  /** Abort the request after this many milliseconds (default 20s). */
  timeoutMs?: number;
  /** Skip the global activity bar (background syncs, polling). */
  silent?: boolean;
  headers?: Record<string, string>;
};

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
const loadingListeners = new Set<(active: number) => void>();
let activeRequests = 0;

/** Fired when an authenticated request comes back 401 (expired/revoked token). */
export function subscribeUnauthorized(listener: Listener) {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

export function subscribeApiLoading(listener: (active: number) => void) {
  loadingListeners.add(listener);
  return () => {
    loadingListeners.delete(listener);
  };
}

function setActive(delta: number) {
  activeRequests = Math.max(0, activeRequests + delta);
  loadingListeners.forEach((listener) => listener(activeRequests));
}

export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return true;
    }
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return Boolean(payload.exp) && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

async function parseJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(
      response.ok
        ? "Invalid server response"
        : `Request failed (${response.status})`,
      response.status,
    );
  }
}

export function formatApiError(data: any, fallback = "Request failed"): string {
  const status = Number(data?.statusCode);
  if (status >= 500) {
    return SERVER_ERROR_MESSAGE;
  }
  const message = data?.message ?? data?.error ?? fallback;
  const text = Array.isArray(message) ? String(message[0]) : String(message);
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

async function rawFetch(
  path: string,
  token: string | null | undefined,
  init: RequestInit,
  options: ApiOptions,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {}),
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (!options.silent) {
    setActive(1);
  }
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    if (response.status === 401 && token) {
      unauthorizedListeners.forEach((listener) => {
        try {
          listener();
        } catch {
          // A failing listener must not break the request chain.
        }
      });
    }
    return response;
  } catch {
    throw new ApiError(timedOut ? TIMEOUT_ERROR_MESSAGE : NETWORK_ERROR_MESSAGE, 0);
  } finally {
    clearTimeout(timer);
    if (!options.silent) {
      setActive(-1);
    }
  }
}

/** Response and parsed body without throwing on non-2xx (used by login). */
export async function apiFetch(
  path: string,
  token: string | null | undefined,
  init: RequestInit,
  options: ApiOptions = {},
) {
  const response = await rawFetch(path, token, init, options);
  const data = await parseJson(response);
  return { data, response };
}

/** JSON request that throws ApiError on any non-2xx response. */
export async function apiRequest(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  token: string | null | undefined,
  body?: unknown,
  options: ApiOptions = {},
) {
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const headers: Record<string, string> = {};
  if (body !== undefined && !isForm) {
    headers["Content-Type"] = "application/json";
  }
  const { data, response } = await apiFetch(
    path,
    token,
    {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : isForm
            ? (body as FormData)
            : JSON.stringify(body),
    },
    options,
  );
  if (!response.ok) {
    throw new ApiError(
      formatApiError(data, `Request failed (${response.status})`),
      response.status,
      data,
    );
  }
  return data;
}

export const apiGet = (path: string, token: string | null | undefined, options?: ApiOptions) =>
  apiRequest("GET", path, token, undefined, options);

export const apiPost = (
  path: string,
  body: object,
  token?: string | null,
  options?: ApiOptions,
) => apiRequest("POST", path, token, body, options);

export const apiPut = (
  path: string,
  body: object | undefined,
  token: string | null | undefined,
  options?: ApiOptions,
) => apiRequest("PUT", path, token, body ?? {}, options);

export const apiPatch = (
  path: string,
  body: object,
  token: string | null | undefined,
  options?: ApiOptions,
) => apiRequest("PATCH", path, token, body, options);

/**
 * Ticket files need the Bearer header, so <img src> cannot load them directly.
 * Fetches the file and returns an object URL the caller must revoke.
 */
export async function fetchFileObjectUrl(
  fileId: string,
  token: string,
): Promise<string> {
  const response = await rawFetch(
    `/tickets/files/${encodeURIComponent(fileId)}`,
    token,
    { method: "GET", headers: { Accept: "*/*" } },
    { silent: true, timeoutMs: 45000 },
  );
  if (!response.ok) {
    throw new ApiError(`Request failed (${response.status})`, response.status);
  }
  return URL.createObjectURL(await response.blob());
}
