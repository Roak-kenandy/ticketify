import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OoredooFmsClient } from 'src/infrastructure/ooredoo-fms/ooredoo-fms.client';
import { isFmsTicketId } from 'src/infrastructure/ooredoo-fms/ooredoo-fms.types';

/**
 * Posts operational notes onto the ticket's source system — CRM for Medianet,
 * FMS comments for Ooredoo — the same way payment charges do.
 */
@Injectable()
export class TicketSystemNotesService {
  private readonly logger = new Logger(TicketSystemNotesService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly fms: OoredooFmsClient,
  ) {}

  /** Best-effort; failures are logged and never block the primary action. */
  async post(ticketId: string, note: string): Promise<boolean> {
    const text = note.trim();
    if (!text || !ticketId) return false;
    if (isFmsTicketId(ticketId)) {
      return this.postFms(ticketId, text);
    }
    return this.postCrm(ticketId, text);
  }

  /** Fire-and-forget wrapper used by inventory / INCA success paths. */
  postLater(ticketId: string, note: string): void {
    void this.post(ticketId, note).catch((error) => {
      this.logger.warn(
        `Ticket note for ${ticketId} failed: ${(error as Error).message}`,
      );
    });
  }

  private async postFms(ticketId: string, note: string): Promise<boolean> {
    if (!this.fms.enabled()) {
      this.logger.warn(`FMS note skipped for ${ticketId}: FMS integration off`);
      return false;
    }
    try {
      await this.fms.addComment(ticketId, note);
      return true;
    } catch (error) {
      this.logger.warn(
        `FMS note for ${ticketId} failed: ${(error as Error).message}`,
      );
      return false;
    }
  }

  private async postCrm(ticketId: string, note: string): Promise<boolean> {
    const base = this.config.get<string>('CRM_BACKOFFICE_API_URL') ?? '';
    if (!base) return false;
    try {
      const res = await fetch(
        `${base.replace(/\/$/, '')}/service_requests/${encodeURIComponent(ticketId)}/notes`,
        {
          method: 'POST',
          headers: {
            api_key: this.config.get('CRM_API_KEY') ?? '',
            accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ note, pinned: false }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) {
        this.logger.warn(
          `CRM note for ${ticketId} rejected (${res.status})`,
        );
      }
      return res.ok;
    } catch (error) {
      this.logger.warn(
        `CRM note for ${ticketId} failed: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
