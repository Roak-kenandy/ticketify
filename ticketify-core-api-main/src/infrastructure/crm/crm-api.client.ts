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

  postServiceRequestAction(ticketId: string, payload: Record<string, unknown>) {
    return this.request('POST', `/service_requests/${ticketId}/actions`, payload);
  }
}
