import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';

export type CrmHttpResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T;
};

/**
 * Hexagonal adapter for CRM Backoffice HTTP API.
 * All CRM traffic should flow through this client (migrate legacy fetch calls gradually).
 */
@Injectable()
export class CrmApiClient {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  private baseUrl(): string {
    const url = this.config.get<string>('CRM_BACKOFFICE_API_URL') ?? '';
    return url.replace(/\/$/, '');
  }

  private defaultHeaders(): Record<string, string> {
    return {
      api_key: this.config.get<string>('CRM_API_KEY') ?? '',
      accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<CrmHttpResult<T>> {
    const url = `${this.baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
    try {
      const response = await fetch(url, {
        method,
        headers: this.defaultHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      let data: T;
      try {
        data = (await response.json()) as T;
      } catch {
        data = null as T;
      }

      if (!response.ok) {
        this.logger.error(
          'CRM API',
          `${method} ${path} failed (${response.status}): ${JSON.stringify(data)}`,
        );
      }

      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      this.logger.error('CRM API', `${method} ${path} network error: ${error}`);
      throw error;
    }
  }

  getServiceRequest(crmId: string) {
    return this.request('GET', `/service_requests/${crmId}`);
  }

  updateServiceRequest(crmId: string, body: Record<string, unknown>) {
    return this.request('PUT', `/service_requests/${crmId}`, body);
  }

  postServiceRequestAction(ticketId: string, payload: Record<string, unknown>) {
    return this.request('POST', `/service_requests/${ticketId}/actions`, payload);
  }

  listActivitiesByServiceRequest(serviceRequestId: string, page = 1, size = 20) {
    return this.request<{ content?: unknown[] }>(
      'GET',
      `/activities?service_request_id=${encodeURIComponent(serviceRequestId)}&page=${page}&size=${size}`,
    );
  }

  /** Best-effort single call for transport LM activity counts (CRM query shape may vary). */
  listActivitiesPage(query: Record<string, string | number>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      params.set(key, String(value));
    }
    return this.request<{ content?: unknown[] }>(
      'GET',
      `/activities?${params.toString()}`,
    );
  }

  listActivityTypes(state = 'ACTIVE') {
    return this.request<{ content?: { id: string; name: string }[] }>(
      'GET',
      `/activities/types?state=${state}`,
    );
  }

  listTeams(page = 1, size = 50) {
    return this.request<{ content?: { id: string; name: string }[] }>(
      'GET',
      `/teams?size=${size}&page=${page}`,
    );
  }

  listTeamUsers(teamId: string, page = 1, size = 50) {
    return this.request<{ content?: { id: string; first_name?: string; last_name?: string }[] }>(
      'GET',
      `/users?size=${size}&page=${page}&teams=${encodeURIComponent(teamId)}`,
    );
  }

  listContactAddresses(contactId: string) {
    return this.request<{ content?: { id: string; address_line_1?: string; type?: string }[] }>(
      'GET',
      `/contacts/${contactId}/addresses`,
    );
  }

  createActivity(payload: Record<string, unknown>) {
    return this.request('POST', '/activities', payload);
  }

  addActivityNote(activityId: string, note: string) {
    return this.request('POST', `/activities/${activityId}/notes`, { note });
  }

  updateActivityState(activityId: string, state: 'PENDING' | 'COMPLETED') {
    return this.request('PUT', `/activities/${activityId}`, { state });
  }

  getActivity(activityId: string) {
    return this.request('GET', `/activities/${activityId}`);
  }
}
