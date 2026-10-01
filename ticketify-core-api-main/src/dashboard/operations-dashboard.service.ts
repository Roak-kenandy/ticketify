import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { DispatchService } from 'src/dispatch/dispatch.service';
import { TicketsService } from 'src/tickets/tickets.service';
import { AssignmentSettingsService } from 'src/assignment/assignment-settings.service';
import { TtlCache } from 'src/infrastructure/common/helpers/ttl-cache';

/** AC-17-style operational snapshot (Ticketify + CRM pool counts). */
@Injectable()
export class OperationsDashboardService {
  private readonly cache = new TtlCache<Awaited<ReturnType<OperationsDashboardService['build']>>>(
    () => Number(this.config.get('OPS_SNAPSHOT_CACHE_MS') ?? 10_000),
  );

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private dispatch: DispatchService,
    private tickets: TicketsService,
    private assignSettings: AssignmentSettingsService,
  ) {}

  getSnapshot() {
    return this.cache.get(() => this.build());
  }

  /** Midnight in the business timezone (Maldives, UTC+5 by default), as a UTC Date. */
  private startOfBusinessDay(): Date {
    const offsetMin = Number(this.config.get('BUSINESS_UTC_OFFSET_MINUTES') ?? 300);
    const shifted = new Date(Date.now() + offsetMin * 60_000);
    shifted.setUTCHours(0, 0, 0, 0);
    return new Date(shifted.getTime() - offsetMin * 60_000);
  }

  private async regionSummary(teamId: string, summaries: { team_id: string }[]) {
    return (
      summaries.find(summary => summary.team_id === teamId) ??
      (await this.tickets.fetchTeamAssignmentSummary(teamId))
    );
  }

  private async build() {
    const maleTeam =
      this.config.get<string>('REGION_MALE_TEAM_ID') ??
      'f9006884-5b7e-4513-89ef-86e14acf0b25';
    const hulhumaleTeam =
      this.config.get<string>('REGION_HULHUMALE_TEAM_ID') ??
      '1b71e6bd-116b-4b54-854f-03e1d2d9fba6';

    const [settings, summaries, technicians, transportLm, paymentsToday, invoicesOpen] =
      await Promise.all([
        this.assignSettings.getSettings(),
        this.dispatch.teamSummaries(),
        this.dispatch.technicianCounts(),
        this.tickets.fetchTransportLmRegionSummary(),
        this.prisma.ticketPayment.count({
          where: { status: 'CONFIRMED', confirmed_at: { gte: this.startOfBusinessDay() } },
        }),
        this.prisma.ticketInvoice.count({
          where: { status: { in: ['DRAFT', 'ISSUED'] } },
        }),
      ]);

    const [maleSummary, hulhSummary] = await Promise.all([
      this.regionSummary(maleTeam, summaries),
      this.regionSummary(hulhumaleTeam, summaries),
    ]);

    return {
      generated_at: new Date().toISOString(),
      auto_assign_enabled: settings.enabled,
      team_auto_assign: settings.team_enabled ?? {},
      regions: {
        male: {
          ...maleSummary,
          team_id: maleTeam,
          label: 'Malé Access',
        },
        hulhumale: {
          ...hulhSummary,
          team_id: hulhumaleTeam,
          label: 'Hulhumalé Access',
        },
        transport_lm: {
          ...transportLm,
          label: 'Transport · Last Mile',
        },
      },
      technicians,
      finance_ticketify: {
        confirmed_payments_today: paymentsToday,
        open_invoices: invoicesOpen,
        note: 'Invoices and receipts are stored in Ticketify only (not CRM).',
      },
      sla_note:
        'Full SLA aging tiles use CRM/Mongo reports; configure queue+team in Reports.',
    };
  }
}
