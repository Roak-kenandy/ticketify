import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import { UserService } from 'src/user/user.service';
import { TicketsService } from 'src/tickets/tickets.service';
import {
  AssignmentSettingsService,
  CATEGORY_LABELS,
  ticketCategory,
  type AutoAssignResult,
  type AutoAssignSettings,
  type PendingAlert,
} from './assignment-settings.service';
import { AssignmentNotifierService } from './assignment-notifier.service';

export type { AutoAssignResult } from './assignment-settings.service';

type TechRow = Awaited<
  ReturnType<UserService['getAutoAssignEligibleTechnicians']>
>[number];

type CrmTicket = {
  id: string;
  number?: string;
  priority?: string;
  creation_date?: number;
  queue?: { name?: string };
  assigned_to?: { user?: { id?: string } | null };
  contact?: any;
  address?: any;
};

const PRIORITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  NORMAL: 2,
  LOW: 3,
};

@Injectable()
export class AssignmentEngineService {
  private readonly logger = new Logger(AssignmentEngineService.name);

  constructor(
    private config: ConfigService,
    private user: UserService,
    private tickets: TicketsService,
    private audit: IntegrationAuditService,
    private assignSettings: AssignmentSettingsService,
    private notifier: AssignmentNotifierService,
  ) {}

  private distanceKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private ticketCoords(ticket: CrmTicket): { lat: number; lng: number } | null {
    const addr =
      ticket?.contact?.primary_address ??
      ticket?.contact?.address ??
      ticket?.address;
    const lat = Number(addr?.lat ?? addr?.latitude);
    const lng = Number(addr?.lon ?? addr?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return { lat, lng };
  }

  private techCoords(tech: TechRow): { lat: number; lng: number } | null {
    const row = tech.user_location_tracking?.[0];
    if (!row) {
      return null;
    }
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return { lat, lng };
  }

  /** Highest priority first, then the oldest ticket (closest to breaching SLA). */
  private compareTickets(a: CrmTicket, b: CrmTicket): number {
    const rank = (t: CrmTicket) => PRIORITY_RANK[String(t.priority ?? '').toUpperCase()] ?? 2;
    return rank(a) - rank(b) || (a.creation_date ?? 0) - (b.creation_date ?? 0);
  }

  async runAutoAssign(options?: {
    team_id?: string;
    actor_user_id?: string;
    max_assignments?: number;
    /** Compute who would get what, without writing to CRM, notifying or recording the run. */
    dry_run?: boolean;
  }): Promise<AutoAssignResult[]> {
    const stored = await this.assignSettings.getSettings();
    const settings = options?.dry_run ? { ...stored, enabled: true } : stored;
    if (!settings.enabled || !this.assignSettings.hasAutoCategory(settings)) {
      return [];
    }

    const regions = await this.assignSettings.regions(settings);
    const uniqueTeams = regions
      .filter(region => region.enabled)
      .map(region => region.team_id)
      .filter(teamId => !options?.team_id || teamId === options.team_id);

    const maxPerRun = options?.max_assignments ?? 20;
    const results: AutoAssignResult[] = [];
    const keepAlertsFor = new Set<string>();

    for (const team_id of uniqueTeams) {
      try {
        results.push(
          await this.autoAssignForTeam(team_id, settings, maxPerRun, {
            actor_user_id: options?.actor_user_id,
            dry_run: Boolean(options?.dry_run),
          }),
        );
      } catch (error) {
        this.logger.warn(`Auto-assign for team ${team_id} failed: ${String(error)}`);
        keepAlertsFor.add(team_id);
        results.push({ team_id, assigned: [], waiting: [], skipped: [], manual_count: 0 });
      }
    }
    if (options?.dry_run) {
      return results;
    }
    if (options?.team_id) {
      for (const alert of settings.pending_alerts) {
        if (alert.team_id !== options.team_id) keepAlertsFor.add(alert.team_id);
      }
    }

    const pending = await this.alertSupervisors(results, settings.pending_alerts, keepAlertsFor);
    await this.assignSettings.recordLastRun(results, pending);
    return results;
  }

  private async autoAssignForTeam(
    team_id: string,
    settings: AutoAssignSettings,
    maxAssignments: number,
    { actor_user_id, dry_run }: { actor_user_id?: string; dry_run: boolean },
  ): Promise<AutoAssignResult> {
    const result: AutoAssignResult = {
      team_id,
      assigned: [],
      waiting: [],
      skipped: [],
      manual_count: 0,
    };

    const [{ new_tickets, in_progress_tickets }, teamMemberIds] = await Promise.all([
      this.tickets.fetchOpenTeamServiceRequests(team_id) as Promise<{
        new_tickets: CrmTicket[];
        in_progress_tickets: CrmTicket[];
      }>,
      this.user.fetchCrmTeamMemberIds(team_id),
    ]);

    const queue = new_tickets
      .filter(ticket => !ticket?.assigned_to?.user?.id)
      .filter(ticket => {
        const category = ticketCategory(ticket);
        if (category && settings.categories[category] === 'AUTO') return true;
        result.manual_count += 1;
        return false;
      })
      .sort((a, b) => this.compareTickets(a, b))
      .slice(0, maxAssignments);

    if (!queue.length) {
      return result;
    }

    // Without the CRM team roster we can't guarantee the correct region, so nothing is assigned.
    if (!teamMemberIds.length) {
      for (const ticket of queue) {
        result.skipped.push({
          ticket_id: ticket.id,
          number: ticket.number ?? null,
          reason: 'team_roster_unavailable',
        });
      }
      return result;
    }

    const eligible = await this.user.getAutoAssignEligibleTechnicians(teamMemberIds, {
      includeBusy: settings.include_busy,
    });

    const workload = new Map<string, number>();
    for (const ticket of [...new_tickets, ...in_progress_tickets]) {
      const userId = ticket?.assigned_to?.user?.id;
      if (userId) workload.set(userId, (workload.get(userId) ?? 0) + 1);
    }

    for (const ticket of queue) {
      const category = ticketCategory(ticket)!;
      const base = {
        ticket_id: ticket.id,
        number: ticket.number ?? null,
        category,
        priority: ticket.priority ?? null,
      };

      const withCapacity = eligible.filter(
        tech =>
          settings.max_open_jobs <= 0 ||
          (workload.get(tech.crm_user_id) ?? 0) < settings.max_open_jobs,
      );
      if (!withCapacity.length) {
        result.waiting.push({
          ...base,
          team_id,
          reason: eligible.length ? 'all_at_capacity' : 'no_eligible_technician',
        });
        continue;
      }

      const tech = this.pickTechnician(ticket, withCapacity, workload, settings);
      if (dry_run) {
        workload.set(tech.crm_user_id, (workload.get(tech.crm_user_id) ?? 0) + 1);
        result.assigned.push({
          ...base,
          crm_user_id: tech.crm_user_id,
          technician_name: tech.name ?? null,
        });
        continue;
      }
      try {
        const assignResult = await this.tickets.assignServiceRequestToUser(
          ticket.id,
          tech.crm_user_id,
        );
        if (assignResult instanceof ForbiddenException) {
          result.skipped.push({ ...base, reason: 'crm_assign_failed' });
          continue;
        }
      } catch (error) {
        result.skipped.push({
          ...base,
          reason: error instanceof ForbiddenException ? error.message : 'assign_error',
        });
        continue;
      }

      workload.set(tech.crm_user_id, (workload.get(tech.crm_user_id) ?? 0) + 1);
      result.assigned.push({
        ...base,
        crm_user_id: tech.crm_user_id,
        technician_name: tech.name ?? null,
      });

      const firstRecord = await this.audit.log({
        entity_type: 'service_request',
        entity_id: ticket.id,
        action: 'AUTO_ASSIGN',
        actor_user_id,
        new_state: {
          team_id,
          number: ticket.number ?? null,
          category,
          priority: ticket.priority ?? null,
          crm_user_id: tech.crm_user_id,
          technician_user_id: tech.id,
          technician_name: tech.name ?? null,
          strategy: settings.strategy,
          presence_rule: settings.include_busy ? 'ONLINE_OR_BUSY' : 'ONLINE_ONLY',
        },
        crm_sync_ok: true,
        idempotency_key: `auto-assign:${ticket.id}:${tech.crm_user_id}`,
      });
      if (firstRecord) {
        await this.notifier.technicianAssigned(tech.id, {
          ticketId: ticket.id,
          number: ticket.number,
          categoryLabel: CATEGORY_LABELS[category],
        });
      }
    }

    return result;
  }

  private pickTechnician(
    ticket: CrmTicket,
    candidates: TechRow[],
    workload: Map<string, number>,
    settings: AutoAssignSettings,
  ): TechRow {
    const ticketPoint = this.ticketCoords(ticket);
    const distance = (tech: TechRow) => {
      const techPoint = this.techCoords(tech);
      if (!ticketPoint || !techPoint) return null;
      return this.distanceKm(ticketPoint.lat, ticketPoint.lng, techPoint.lat, techPoint.lng);
    };
    const load = (tech: TechRow) => workload.get(tech.crm_user_id) ?? 0;

    const weightLoad = Number(this.config.get('AUTO_ASSIGN_WEIGHT_LOAD') ?? 10);
    const weightProx = Number(this.config.get('AUTO_ASSIGN_WEIGHT_PROXIMITY') ?? 1);

    const scored = candidates.map(tech => ({ tech, load: load(tech), km: distance(tech) }));
    const km = (value: number | null) => value ?? Number.POSITIVE_INFINITY;
    const byName = (a: TechRow, b: TechRow) => (a.name ?? '').localeCompare(b.name ?? '');

    scored.sort((a, b) => {
      if (settings.strategy === 'least_busy') {
        return a.load - b.load || km(a.km) - km(b.km) || byName(a.tech, b.tech);
      }
      if (settings.strategy === 'nearest') {
        return km(a.km) - km(b.km) || a.load - b.load || byName(a.tech, b.tech);
      }
      const score = (s: (typeof scored)[number]) => s.load * weightLoad + (s.km ?? 0) * weightProx;
      return score(a) - score(b) || byName(a.tech, b.tech);
    });

    return scored[0].tech;
  }

  /**
   * Waiting tickets stay in the pool. Supervisors are alerted once per ticket, when it first
   * starts waiting, rather than on every scheduler tick.
   */
  private async alertSupervisors(
    results: AutoAssignResult[],
    previous: PendingAlert[],
    keepAlertsFor: Set<string>,
  ): Promise<PendingAlert[]> {
    const now = new Date().toISOString();
    const previousById = new Map(previous.map(alert => [alert.ticket_id, alert]));

    const current: PendingAlert[] = results.flatMap(r =>
      r.waiting.map(ticket => ({
        ...ticket,
        since: previousById.get(ticket.ticket_id)?.since ?? now,
      })),
    );
    const carried = previous.filter(alert => keepAlertsFor.has(alert.team_id));

    const fresh = current.filter(alert => !previousById.has(alert.ticket_id));
    if (fresh.length) {
      await this.notifier.supervisorsNoTechnician(fresh);
      for (const alert of fresh) {
        await this.audit.log({
          entity_type: 'service_request',
          entity_id: alert.ticket_id,
          action: 'AUTO_ASSIGN_NO_CANDIDATE',
          new_state: alert,
          crm_sync_ok: true,
        });
      }
    }

    return [...current, ...carried];
  }
}
