import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import { UserService } from 'src/user/user.service';
import { TicketsService } from 'src/tickets/tickets.service';
import { AssignmentSettingsService } from './assignment-settings.service';

export type AutoAssignResult = {
  team_id: string;
  assigned: { ticket_id: string; crm_user_id: string }[];
  skipped: { ticket_id: string; reason: string }[];
};

type TechRow = Awaited<
  ReturnType<UserService['getAutoAssignEligibleTechnicians']>
>[number] & {
  user_location_tracking?: { latitude: number; longitude: number }[];
};

@Injectable()
export class AssignmentEngineService {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private user: UserService,
    private tickets: TicketsService,
    private audit: IntegrationAuditService,
    private assignSettings: AssignmentSettingsService,
  ) {}

  private defaultTeamIds(): string[] {
    const fromEnv = this.config.get<string>('AUTO_ASSIGN_TEAM_IDS');
    if (fromEnv?.trim()) {
      return fromEnv
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);
    }
    return [
      'f9006884-5b7e-4513-89ef-86e14acf0b25',
      '1b71e6bd-116b-4b54-854f-03e1d2d9fba6',
    ];
  }

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

  private ticketCoords(ticket: any): { lat: number; lng: number } | null {
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

  async runAutoAssign(options?: {
    team_id?: string;
    actor_user_id?: string;
    max_assignments?: number;
  }): Promise<AutoAssignResult[]> {
    const settings = await this.assignSettings.getSettings();
    if (!settings.enabled) {
      return [];
    }

    const policies = await this.prisma.assignmentPolicy.findMany({
      where: { mode: 'AUTO' },
    });

    const policyTeamIds = policies
      .map(p => p.queue_id)
      .filter((id): id is string => Boolean(id));

    const teamIds = options?.team_id
      ? [options.team_id]
      : policyTeamIds.length
        ? policyTeamIds
        : this.defaultTeamIds();

    const uniqueTeams = [...new Set(teamIds)].filter(teamId =>
      this.assignSettings.isTeamAutoAssignEnabled(settings, teamId),
    );

    const maxPerRun = options?.max_assignments ?? 20;
    const results: AutoAssignResult[] = [];

    for (const team_id of uniqueTeams) {
      const result = await this.autoAssignForTeam(
        team_id,
        maxPerRun,
        options?.actor_user_id,
      );
      results.push(result);
    }

    return results;
  }

  private async autoAssignForTeam(
    team_id: string,
    maxAssignments: number,
    actor_user_id?: string,
  ): Promise<AutoAssignResult> {
    const teamMemberIds = await this.user.fetchCrmTeamMemberIds(team_id);
    const eligible = (await this.user.getAutoAssignEligibleTechnicians(
      teamMemberIds.length ? teamMemberIds : undefined,
    )) as TechRow[];

    const eligibleInTeam = teamMemberIds.length
      ? eligible.filter(t => teamMemberIds.includes(t.crm_user_id))
      : eligible;

    const unassigned = await this.tickets.fetchUnassignedNewTeamTickets(
      team_id,
    );

    const assigned: AutoAssignResult['assigned'] = [];
    const skipped: AutoAssignResult['skipped'] = [];

    if (!eligibleInTeam.length) {
      for (const ticket of unassigned.slice(0, maxAssignments)) {
        skipped.push({
          ticket_id: ticket.id,
          reason: 'no_eligible_technicians',
        });
      }
      return { team_id, assigned, skipped };
    }

    const workload = new Map<string, number>();
    await Promise.all(
      eligibleInTeam.map(async tech => {
        const count = await this.tickets.countInProgressTicketsForUser(
          tech.crm_user_id,
        );
        workload.set(tech.crm_user_id, count);
      }),
    );

    const weightLoad = Number(
      this.config.get('AUTO_ASSIGN_WEIGHT_LOAD') ?? 10,
    );
    const weightProx = Number(
      this.config.get('AUTO_ASSIGN_WEIGHT_PROXIMITY') ?? 1,
    );

    const pickTechnician = (ticket: any) => {
      const ticketPoint = this.ticketCoords(ticket);
      let best = eligibleInTeam[0];
      let bestScore = Number.POSITIVE_INFINITY;

      for (const tech of eligibleInTeam) {
        const load = workload.get(tech.crm_user_id) ?? 0;
        let score = load * weightLoad;
        const techPoint = this.techCoords(tech);
        if (ticketPoint && techPoint) {
          score +=
            this.distanceKm(
              ticketPoint.lat,
              ticketPoint.lng,
              techPoint.lat,
              techPoint.lng,
            ) * weightProx;
        }
        if (score < bestScore) {
          bestScore = score;
          best = tech;
        }
      }
      workload.set(
        best.crm_user_id,
        (workload.get(best.crm_user_id) ?? 0) + 1,
      );
      return best;
    };

    for (const ticket of unassigned.slice(0, maxAssignments)) {
      const tech = pickTechnician(ticket);
      try {
        const assignResult = await this.tickets.assignServiceRequestToUser(
          ticket.id,
          tech.crm_user_id,
        );
        if (assignResult instanceof ForbiddenException) {
          skipped.push({ ticket_id: ticket.id, reason: 'crm_assign_failed' });
          continue;
        }
        assigned.push({ ticket_id: ticket.id, crm_user_id: tech.crm_user_id });
        await this.audit.log({
          entity_type: 'service_request',
          entity_id: ticket.id,
          action: 'AUTO_ASSIGN',
          actor_user_id,
          new_state: {
            team_id,
            crm_user_id: tech.crm_user_id,
            presence_rule: 'ONLINE_OR_OFFLINE_BUSY_EXCLUDED',
          },
          crm_sync_ok: true,
          idempotency_key: `auto-assign:${ticket.id}:${tech.crm_user_id}`,
        });
      } catch {
        skipped.push({ ticket_id: ticket.id, reason: 'assign_error' });
      }
    }

    return { team_id, assigned, skipped };
  }
}
