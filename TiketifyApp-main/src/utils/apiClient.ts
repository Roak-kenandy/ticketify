import {API_BASE_URL} from '../config/api';
import {trackApiLoading} from './apiLoading';

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
    throw new Error(
      response.ok
        ? 'Invalid server response'
        : `Request failed (${response.status})`,
    );
  }
}

export async function apiFetch(
  path: string,
  token: string | null | undefined,
  init: RequestInit = {},
): Promise<{data: any; response: Response}> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const run = async () => {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });
    const data = await parseJsonResponse(response);
    return {data, response};
  };
  return trackApiLoading(run());
}

export function formatApiError(
  data: any,
  fallback = 'Request failed',
): string {
  const message = data?.message ?? data?.error ?? fallback;
  return Array.isArray(message) ? String(message[0]) : String(message);
}

export async function apiGet(path: string, token: string) {
  const {data, response} = await apiFetch(path, token);
  if (!response.ok) {
    const error = new Error(formatApiError(data, `Request failed (${response.status})`));
    (error as any).status = response.status;
    throw error;
  }
  return data;
}

export async function apiPost(path: string, body: object, token?: string | null) {
  const {data, response} = await apiFetch(path, token, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = new Error(formatApiError(data, `Request failed (${response.status})`));
    (error as any).status = response.status;
    throw error;
  }
  return data;
}
