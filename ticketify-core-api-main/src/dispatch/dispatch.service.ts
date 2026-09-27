import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { TicketsService } from 'src/tickets/tickets.service';
import { UserService } from 'src/user/user.service';
import { AssignmentSettingsService } from 'src/assignment/assignment-settings.service';

@Injectable()
export class DispatchService {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private tickets: TicketsService,
    private user: UserService,
    private assignSettings: AssignmentSettingsService,
  ) {}

  private teamIds(): string[] {
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

  async overview() {
    const settings = await this.assignSettings.getSettings();
    const teams = this.teamIds();
    const pools = await Promise.all(teams.map(id => this.unassignedByTeam(id)));
    const assignmentSummaries = await Promise.all(
      teams.map(id => this.tickets.fetchTeamAssignmentSummary(id)),
    );

    const presence = await this.prisma.user.groupBy({
      by: ['presence'],
      where: { role_id: '2' },
      _count: true,
    });

    const eligible = await this.user.getAutoAssignEligibleTechnicians();
    const onlineCount =
      presence.find(p => p.presence === 'ONLINE')?._count ?? 0;

    return {
      auto_assign_enabled: settings.enabled,
      team_auto_assign: settings.team_enabled ?? {},
      unassigned_pools: pools,
      team_assignment: assignmentSummaries,
      technicians: {
        online: onlineCount,
        offline:
          presence.find(p => p.presence === 'OFFLINE')?._count ?? 0,
        busy: presence.find(p => p.presence === 'BUSY')?._count ?? 0,
        auto_assign_eligible: eligible.length,
        by_presence: presence.map(p => ({
          presence: p.presence,
          count: p._count,
        })),
      },
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
    return { result, actor_user_id: actorUserId };
  }
}
