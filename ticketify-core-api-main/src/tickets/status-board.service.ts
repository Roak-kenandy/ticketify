import { BadRequestException, Injectable } from '@nestjs/common';
import { TicketPaymentStatus } from '@prisma/client';
import { can, UserAccess } from 'src/auth/access/access';
import { WorkflowConfigService } from 'src/config/workflow-config.service';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';
import { LoggerService } from 'src/infrastructure/logger/logger.service';
import { TicketsService } from './tickets.service';

export const STATUS_BUCKETS = [
  'pending',
  'no_response',
  'payment_pending',
  'rescheduled',
] as const;
export type StatusBucket = (typeof STATUS_BUCKETS)[number];

type CrmTicket = {
  id: string;
  assigned_to?: { team?: { id?: string; name?: string } | null } | null;
  [key: string]: unknown;
};

/** Filter value for tickets that are not assigned to any team. */
export const NO_TEAM = 'none';

export type StatusBoardTicket = CrmTicket & {
  status_info?: {
    scheduled_at?: string;
    schedule_count?: number;
    payment?: { reference: string; amount_mvr: number; created_at: string };
    no_response_since?: number | null;
  };
};

export type StatusBoard = {
  scope: 'mine' | 'all';
  generated_at: string;
  counts: Record<StatusBucket, number>;
  /** False when the CRM could not be asked for No response activities. */
  no_response_available: boolean;
  /** Teams whose tickets could not be loaded (all-teams view only). */
  failed_teams: string[];
  /** Team the board is filtered to, or null for every team. */
  team: string | null;
  /** Teams with open tickets, for the area filter; count is open (Pending) tickets. */
  teams: { id: string; name: string; count: number }[];
  tickets: Record<StatusBucket, StatusBoardTicket[]>;
};

type FullBoard = Omit<StatusBoard, 'counts' | 'team' | 'teams' | 'tickets'> & {
  buckets: Record<StatusBucket, StatusBoardTicket[]>;
};

const CACHE_MS = 60_000;
const LIST_LIMIT = 200;
const ACTIVITY_PAGES = 5;

/**
 * Dashboard status cards: open tickets (Pending) and the ones waiting on the customer
 * (No response), on payment (Payment pending) or with a visit moved (Rescheduled).
 * Technicians see their own tickets; supervisors and above see every team.
 */
@Injectable()
export class StatusBoardService {
  private cache = new Map<string, { at: number; value: Promise<FullBoard> }>();

  constructor(
    private readonly tickets: TicketsService,
    private readonly crm: CrmApiClient,
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowConfigService,
    private readonly logger: LoggerService,
  ) {}

  /** Dashboard viewers see every ticket; technician-app users only their own. */
  static scopeFor(access: UserAccess | undefined): 'mine' | 'all' {
    return can(access, 'dashboard') ? 'all' : 'mine';
  }

  async board(
    user: { crm_user_id?: string | null; access?: UserAccess },
    team?: string | null,
  ): Promise<StatusBoard> {
    const scope = StatusBoardService.scopeFor(user.access);
    const key = scope === 'all' ? 'all' : `mine:${user.crm_user_id ?? ''}`;
    let hit = this.cache.get(key);
    if (!hit || Date.now() - hit.at >= CACHE_MS) {
      const value = this.build(scope, user.crm_user_id ?? null);
      value.catch(() => {
        if (this.cache.get(key)?.value === value) this.cache.delete(key);
      });
      hit = { at: Date.now(), value };
      this.cache.set(key, hit);
    }
    return StatusBoardService.view(await hit.value, team?.trim() || null);
  }

  private static teamOf(ticket: CrmTicket): { id: string; name: string } {
    const team = ticket.assigned_to?.team;
    return team?.id
      ? { id: team.id, name: team.name?.trim() || 'Unnamed team' }
      : { id: NO_TEAM, name: 'No team' };
  }

  /** Narrows the cached board to one team and caps each list. */
  private static view(full: FullBoard, team: string | null): StatusBoard {
    const teams = new Map<
      string,
      { id: string; name: string; count: number }
    >();
    for (const ticket of full.buckets.pending) {
      const { id, name } = StatusBoardService.teamOf(ticket);
      const entry = teams.get(id) ?? { id, name, count: 0 };
      entry.count++;
      teams.set(id, entry);
    }
    const pick = (list: StatusBoardTicket[]) =>
      team
        ? list.filter((ticket) => StatusBoardService.teamOf(ticket).id === team)
        : list;
    const filtered = Object.fromEntries(
      STATUS_BUCKETS.map((bucket) => [bucket, pick(full.buckets[bucket])]),
    ) as Record<StatusBucket, StatusBoardTicket[]>;
    return {
      scope: full.scope,
      generated_at: full.generated_at,
      no_response_available: full.no_response_available,
      failed_teams: full.failed_teams,
      team,
      teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name)),
      counts: Object.fromEntries(
        STATUS_BUCKETS.map((bucket) => [bucket, filtered[bucket].length]),
      ) as Record<StatusBucket, number>,
      tickets: Object.fromEntries(
        STATUS_BUCKETS.map((bucket) => [
          bucket,
          filtered[bucket].slice(0, LIST_LIMIT),
        ]),
      ) as Record<StatusBucket, StatusBoardTicket[]>,
    };
  }

  private async build(
    scope: 'mine' | 'all',
    crmUserId: string | null,
  ): Promise<FullBoard> {
    let open: CrmTicket[];
    let failedTeams: string[] = [];
    if (scope === 'all') {
      const result = await this.tickets.fetchOpenTicketsAllTeams();
      open = result.tickets as CrmTicket[];
      failedTeams = result.failed_teams;
    } else {
      if (!crmUserId) {
        throw new BadRequestException(
          'Your account is not linked to a CRM user.',
        );
      }
      open = (await this.tickets.fetchOpenTickets(crmUserId)) as CrmTicket[];
    }
    const ids = open.map((ticket) => ticket.id);
    const [noResponse, payments, schedules] = await Promise.all([
      this.pendingNoResponse(),
      ids.length
        ? this.prisma.ticketPayment.findMany({
            where: {
              status: TicketPaymentStatus.PENDING,
              crm_ticket_id: { in: ids },
            },
            orderBy: { created_at: 'desc' },
            select: {
              crm_ticket_id: true,
              reference: true,
              amount_mvr: true,
              created_at: true,
            },
          })
        : [],
      ids.length
        ? this.prisma.ticketSchedule.findMany({
            where: { crm_ticket_id: { in: ids } },
            orderBy: { scheduled_at: 'desc' },
            select: { crm_ticket_id: true, scheduled_at: true },
          })
        : [],
    ]);

    const paymentByTicket = new Map<string, (typeof payments)[number]>();
    for (const payment of payments) {
      if (!paymentByTicket.has(payment.crm_ticket_id)) {
        paymentByTicket.set(payment.crm_ticket_id, payment);
      }
    }
    const visits = new Map<string, Date[]>();
    for (const row of schedules) {
      const list = visits.get(row.crm_ticket_id) ?? [];
      if (!list.some((at) => at.getTime() === row.scheduled_at.getTime())) {
        list.push(row.scheduled_at);
      }
      visits.set(row.crm_ticket_id, list);
    }

    const buckets: Record<StatusBucket, StatusBoardTicket[]> = {
      pending: [],
      no_response: [],
      payment_pending: [],
      rescheduled: [],
    };
    for (const ticket of open) {
      buckets.pending.push(ticket);
      if (noResponse.ids.has(ticket.id)) {
        buckets.no_response.push({
          ...ticket,
          status_info: { no_response_since: noResponse.ids.get(ticket.id) },
        });
      }
      const payment = paymentByTicket.get(ticket.id);
      if (payment) {
        buckets.payment_pending.push({
          ...ticket,
          status_info: {
            payment: {
              reference: payment.reference,
              amount_mvr: Number(payment.amount_mvr),
              created_at: payment.created_at.toISOString(),
            },
          },
        });
      }
      const times = visits.get(ticket.id) ?? [];
      if (times.length > 1) {
        buckets.rescheduled.push({
          ...ticket,
          status_info: {
            scheduled_at: times[0].toISOString(),
            schedule_count: times.length,
          },
        });
      }
    }

    return {
      scope,
      generated_at: new Date().toISOString(),
      no_response_available: noResponse.ok,
      failed_teams: failedTeams,
      buckets,
    };
  }

  /** Service requests with a PENDING "No Response" activity, with when it was raised. */
  private async pendingNoResponse(): Promise<{
    ok: boolean;
    ids: Map<string, number | null>;
  }> {
    const typeId = this.workflow.getNoResponseActivityTypeId();
    const ids = new Map<string, number | null>();
    try {
      for (let page = 1; page <= ACTIVITY_PAGES; page++) {
        const response = await this.crm.listActivitiesPage({
          type_id: typeId,
          state: 'PENDING',
          size: 100,
          page,
        });
        if (!response.ok) return { ok: false, ids };
        const body = response.data as {
          content?: {
            state?: string;
            service_request?: { id?: string };
            created_date?: number;
          }[];
          paging?: { has_more?: boolean };
        };
        const content = Array.isArray(body?.content) ? body.content : [];
        for (const activity of content) {
          const id = activity.service_request?.id;
          if (id && activity.state === 'PENDING' && !ids.has(id)) {
            ids.set(id, activity.created_date ?? null);
          }
        }
        if (!body?.paging?.has_more || !content.length) break;
      }
      return { ok: true, ids };
    } catch (error) {
      this.logger.warn(
        'Status board',
        `No response activities unavailable: ${error instanceof Error ? error.message : error}`,
      );
      return { ok: false, ids };
    }
  }
}
