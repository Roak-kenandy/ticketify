import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { DispatchService } from 'src/dispatch/dispatch.service';
import { TicketsService } from 'src/tickets/tickets.service';

/** AC-17-style operational snapshot (Ticketify + CRM pool counts). */
@Injectable()
export class OperationsDashboardService {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private dispatch: DispatchService,
    private tickets: TicketsService,
  ) {}

  async getSnapshot() {
    const overview = await this.dispatch.overview();
    const maleTeam =
      this.config.get<string>('REGION_MALE_TEAM_ID') ??
      'f9006884-5b7e-4513-89ef-86e14acf0b25';
    const hulhumaleTeam =
      this.config.get<string>('REGION_HULHUMALE_TEAM_ID') ??
      '1b71e6bd-116b-4b54-854f-03e1d2d9fba6';

    const maleSummary =
      overview.team_assignment?.find((t: { team_id: string }) => t.team_id === maleTeam) ??
      (await this.tickets.fetchTeamAssignmentSummary(maleTeam));
    const hulhSummary =
      overview.team_assignment?.find(
        (t: { team_id: string }) => t.team_id === hulhumaleTeam,
      ) ?? (await this.tickets.fetchTeamAssignmentSummary(hulhumaleTeam));

    const paymentsToday = await this.prisma.ticketPayment.count({
      where: {
        status: 'CONFIRMED',
        confirmed_at: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });

    const invoicesOpen = await this.prisma.ticketInvoice.count({
      where: { status: { in: ['DRAFT', 'ISSUED'] } },
    });

    const transportLm = await this.tickets.fetchTransportLmRegionSummary();

    return {
      generated_at: new Date().toISOString(),
      auto_assign_enabled: overview.auto_assign_enabled,
      team_auto_assign: overview.team_auto_assign,
      regions: {
        male: {
          team_id: maleTeam,
          label: 'Malé Access',
          ...maleSummary,
        },
        hulhumale: {
          team_id: hulhumaleTeam,
          label: 'Hulhumalé Access',
          ...hulhSummary,
        },
        transport_lm: {
          label: 'Transport · Last Mile',
          ...transportLm,
        },
      },
      technicians: overview.technicians,
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
