import { Injectable } from '@nestjs/common';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import { LoggerService } from 'src/infrastructure/logger/logger.service';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';

type CrmStage = { id: string; name?: string; state?: string };

type CrmServiceRequest = {
  number?: string;
  state?: string;
  stage?: CrmStage;
  queue?: { id?: string; name?: string };
  assigned_to?: { team?: { id?: string }; user?: { id?: string } | null };
};

export type RequeueResult =
  | {
      moved: true;
      ticket_number?: string;
      stage_name?: string;
      unassigned: boolean;
    }
  | { moved: false; reason: string };

const STAGE_CACHE_MS = 60 * 60 * 1000;

/**
 * Sends a CRM service request back to its queue's "New" stage (REGRESS) and
 * releases the technician so the ticket returns to the team pool.
 */
@Injectable()
export class ServiceRequestRequeueService {
  private readonly newStages = new Map<
    string,
    { stage: CrmStage; at: number }
  >();

  constructor(
    private readonly crm: CrmApiClient,
    private readonly audit: IntegrationAuditService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {}

  async alreadyHandled(key: string): Promise<boolean> {
    const row = await this.prisma.integrationAuditLog.findUnique({
      where: { idempotency_key: key },
      select: { id: true },
    });
    return Boolean(row);
  }

  /** The queue's NEW stage, as listed by CRM; stage ids differ per queue. */
  async newStageFor(queueId: string): Promise<CrmStage | null> {
    const cached = this.newStages.get(queueId);
    if (cached && Date.now() - cached.at < STAGE_CACHE_MS) return cached.stage;
    const res = await this.crm.request<{ stages?: CrmStage[] }>(
      'GET',
      `/service_requests/queues/${encodeURIComponent(queueId)}`,
    );
    const stage = res.ok
      ? (res.data?.stages ?? []).find((each) => each.state === 'NEW')
      : undefined;
    if (!stage) return null;
    this.newStages.set(queueId, { stage, at: Date.now() });
    return stage;
  }

  /**
   * `key` makes the move happen once per cause (e.g. one LM activity, one payment):
   * a second call with the same key does nothing.
   */
  async moveToNew(
    ticketId: string,
    comment: string,
    cause: {
      action: string;
      key: string;
      actorUserId?: string;
      details?: Record<string, unknown>;
    },
  ): Promise<RequeueResult> {
    if (await this.alreadyHandled(cause.key))
      return { moved: false, reason: 'Already moved for this reason' };
    const sr = await this.crm.getServiceRequest(ticketId);
    if (!sr.ok)
      return { moved: false, reason: 'Service request not found in CRM' };
    const data = sr.data as CrmServiceRequest;
    if (data.state === 'CLOSED' || data.state === 'CANCELLED') {
      await this.audit.log({
        entity_type: 'ticket',
        entity_id: ticketId,
        action: `${cause.action}_SKIPPED`,
        new_state: { reason: data.state, ...cause.details },
        idempotency_key: cause.key,
      });
      return { moved: false, reason: `Ticket is ${data.state.toLowerCase()}` };
    }
    const queueId = data.queue?.id;
    const stage = queueId ? await this.newStageFor(queueId) : null;
    if (!stage)
      return {
        moved: false,
        reason: 'No New stage found for the ticket queue',
      };

    const claimed = await this.audit.log({
      entity_type: 'ticket',
      entity_id: ticketId,
      action: cause.action,
      actor_user_id: cause.actorUserId,
      old_state: {
        stage: data.stage?.name,
        assigned_user_id: data.assigned_to?.user?.id ?? null,
      },
      new_state: { stage: stage.name, ...cause.details },
      crm_sync_ok: true,
      idempotency_key: cause.key,
    });
    if (!claimed)
      return { moved: false, reason: 'Already moved for this reason' };

    if (data.stage?.id !== stage.id) {
      const regressed = await this.crm.postServiceRequestAction(ticketId, {
        action: 'REGRESS',
        stage_id: stage.id,
        comment,
        date_achieved: Math.floor(Date.now() / 1000),
      });
      if (!regressed.ok) {
        await this.prisma.integrationAuditLog.deleteMany({
          where: { idempotency_key: cause.key },
        });
        await this.audit.log({
          entity_type: 'ticket',
          entity_id: ticketId,
          action: `${cause.action}_FAILED`,
          crm_sync_ok: false,
          error_message: `REGRESS failed (${regressed.status})`,
        });
        this.logger.error(
          'Requeue',
          `REGRESS of ${data.number ?? ticketId} failed (${regressed.status})`,
        );
        return {
          moved: false,
          reason: `CRM refused to move the ticket (${regressed.status})`,
        };
      }
    }

    let unassigned = false;
    if (data.assigned_to?.user?.id) {
      const released = await this.crm.updateServiceRequest(ticketId, {
        assigned_to: {
          user_id: null,
          team_id: data.assigned_to.team?.id ?? null,
        },
      });
      unassigned = released.ok;
      if (!released.ok) {
        this.logger.error(
          'Requeue',
          `Could not unassign ${data.number ?? ticketId} (${released.status})`,
        );
      }
    }

    this.logger.log(
      'Requeue',
      `${data.number ?? ticketId} moved to ${stage.name} (${cause.action})`,
    );
    return {
      moved: true,
      ticket_number: data.number,
      stage_name: stage.name,
      unassigned,
    };
  }
}
