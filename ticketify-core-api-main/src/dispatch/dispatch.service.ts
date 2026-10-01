import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import { TicketsService } from 'src/tickets/tickets.service';
import { UserService } from 'src/user/user.service';
import {
  AssignmentSettingsService,
  CATEGORY_LABELS,
  ticketCategory,
} from 'src/assignment/assignment-settings.service';
import { AssignmentNotifierService } from 'src/assignment/assignment-notifier.service';
import { TtlCache } from 'src/infrastructure/common/helpers/ttl-cache';

type TeamSummary = Awaited<ReturnType<TicketsService['fetchTeamAssignmentSummary']>>;

@Injectable()
export class DispatchService {
  private readonly teamSummaryCache = new TtlCache<TeamSummary[]>(() =>
    Number(this.config.get('OPS_SNAPSHOT_CACHE_MS') ?? 10_000),
  );

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private tickets: TicketsService,
    private user: UserService,
    private assignSettings: AssignmentSettingsService,
    private audit: IntegrationAuditService,
    private notifier: AssignmentNotifierService,
  ) {}

  teamIds(): string[] {
    const fromEnv = this.config.get<string>('AUTO_ASSIGN_TEAM_IDS');
    if (fromEnv?.trim()) {
      return fromEnv.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [
      'f9006884-5b7e-4513-89ef-86e14acf0b25',
      '1b71e6bd-116b-4b54-854f-03e1d2d9fba6',
    ];
  }

  async unassignedByTeam(teamId: string) {
    const tickets = await this.tickets.fetchUnassignedNewTeamTickets(teamId);
    return {
      team_id: teamId,
      count: tickets.length,
      tickets: tickets.map((t: { id: string; number?: string; state?: string }) => ({
        id: t.id,
        number: t.number,
        state: t.state,
      })),
    };
  }

  /** Cached briefly: the map, operations board and every open admin tab poll this. */
  teamSummaries(): Promise<TeamSummary[]> {
    return this.teamSummaryCache.get(() =>
      Promise.all(this.teamIds().map(id => this.tickets.fetchTeamAssignmentSummary(id))),
    );
  }

  invalidateTeamSummaries() {
    this.teamSummaryCache.invalidate();
  }

  async technicianCounts() {
    const settings = await this.assignSettings.getSettings();
    const [presence, eligible] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['presence'],
        where: { role_id: '2' },
        _count: true,
      }),
      this.user.getAutoAssignEligibleTechnicians(undefined, {
        includeBusy: settings.include_busy,
      }),
    ]);
    const count = (state: string) => presence.find(p => p.presence === state)?._count ?? 0;
    return {
      online: count('ONLINE'),
      offline: count('OFFLINE'),
      busy: count('BUSY'),
      total: presence.reduce((sum, p) => sum + p._count, 0),
      auto_assign_eligible: eligible.length,
      by_presence: presence.map(p => ({ presence: p.presence, count: p._count })),
    };
  }

  async overview() {
    const teams = this.teamIds();
    const [settings, assignmentSummaries, technicians] = await Promise.all([
      this.assignSettings.getSettings(),
      this.teamSummaries(),
      this.technicianCounts(),
    ]);

    return {
      auto_assign_enabled: settings.enabled,
      team_auto_assign: settings.team_enabled ?? {},
      unassigned_pools: assignmentSummaries.map(summary => ({
        team_id: summary.team_id,
        count: summary.unassigned_new,
      })),
      team_assignment: assignmentSummaries,
      technicians,
      regions: {
        male_team_id: teams[0] ?? null,
        islands_team_id: teams[1] ?? null,
      },
    };
  }

  async manualAssign(ticketId: string, crmUserId: string, actorUserId: string) {
    const result = await this.tickets.assignServiceRequestToUser(
      ticketId,
      crmUserId,
    );
    this.invalidateTeamSummaries();
    if (result instanceof ForbiddenException) {
      throw result;
    }

    const [technician, ticket] = await Promise.all([
      this.prisma.user.findUnique({
        where: { crm_user_id: crmUserId },
        select: { id: true, name: true },
      }),
      this.tickets.crmFindServiceRequest(ticketId).catch(() => null),
    ]);
    const category = ticket ? ticketCategory(ticket) : null;
    await this.audit.log({
      entity_type: 'service_request',
      entity_id: ticketId,
      action: 'MANUAL_ASSIGN',
      actor_user_id: actorUserId,
      new_state: {
        number: ticket?.number ?? null,
        category,
        crm_user_id: crmUserId,
        technician_user_id: technician?.id ?? null,
        technician_name: technician?.name ?? null,
      },
      crm_sync_ok: true,
    });
    if (technician) {
      await this.notifier.technicianAssigned(technician.id, {
        number: ticket?.number,
        categoryLabel: category ? CATEGORY_LABELS[category] : null,
      });
    }
    return { result, actor_user_id: actorUserId };
  }
}
