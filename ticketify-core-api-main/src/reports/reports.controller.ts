import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { TicketPaymentService } from 'src/payments/ticket-payment.service';
import { JwtGuard } from 'src/auth/guard';
import { ReportsService } from './reports.service';
import { FinanceReportService } from './finance-report.service';
import { MasterReportService } from './master-report.service';
import { Access } from 'src/auth/access/access';
import { FINANCE_PENDING, FINANCE_REMIND, FINANCE_SUMMARY, MASTER_REPORT, PAYMENTS_REPORT, REPORT_FILTERS, TICKET_AGING } from 'src/auth/access/requirements';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly financeReport: FinanceReportService,
    private readonly masterReport: MasterReportService,
    private readonly payments: TicketPaymentService,
  ) {}

  @UseGuards(JwtGuard)
  @Access(FINANCE_SUMMARY)
  @Get('finance/summary')
  financeSummary() {
    return this.financeReport.summary();
  }

  @UseGuards(JwtGuard)
  @Access(FINANCE_PENDING)
  @Get('finance/pending')
  financePending() {
    return this.financeReport.pending();
  }

  @UseGuards(JwtGuard)
  @Access(FINANCE_REMIND)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('finance/pending/:reference/remind')
  remindPendingPayment(
    @Param('reference') reference: string,
    @Req() req: { user: { id: string } },
  ) {
    return this.payments.sendPaymentReminder(reference, req.user.id);
  }

  @UseGuards(JwtGuard)
  @Access(PAYMENTS_REPORT)
  @Get('finance/payments')
  financePayments(
    @Query('service_request_id') serviceRequestId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.financeReport.list({ serviceRequestId, from, to });
  }

  @UseGuards(JwtGuard)
  @Access(PAYMENTS_REPORT)
  @Get('finance/payments/export')
  async exportFinancePayments(
    @Query('service_request_id') serviceRequestId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const rows = await this.financeReport.list({
      serviceRequestId,
      from,
      to,
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.ms-excel; charset=utf-8',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="finance-payments.xls"',
    );
    res.send(this.financeReport.toExcel(rows));
  }

  @UseGuards(JwtGuard)
  @Access(MASTER_REPORT)
  @Get('master/tickets/export')
  async exportMasterTickets(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('location') location: string,
    @Query('type') type: string,
    @Query('ticket_no') ticketNo: string,
    @Res() res: Response,
  ) {
    const rows = await this.masterReport.list({
      startDate,
      endDate,
      location,
      type,
      ticketNo,
    });
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="master-tickets.xls"',
    );
    res.send(this.masterReport.toExcel(rows));
  }

  @UseGuards(JwtGuard)
  @Access(MASTER_REPORT)
  @Get('master/tickets')
  masterTickets(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('location') location?: string,
    @Query('type') type?: string,
    @Query('ticket_no') ticketNo?: string,
  ) {
    return this.masterReport.list({
      startDate,
      endDate,
      location,
      type,
      ticketNo,
    });
  }

  @UseGuards(JwtGuard)
  @Access(TICKET_AGING)
  @Get('tickets')
  async getTickets() {
    return this.reportsService.findTotalTickets();
  }

  @UseGuards(JwtGuard)
  @Access(REPORT_FILTERS)
  @Get('queues')
  async getTicketQueues() {
    return this.reportsService.getTicketQueues();
  }

  @UseGuards(JwtGuard)
  @Access(REPORT_FILTERS)
  @Get('teams')
  async getTeams() {
    return this.reportsService.getTeams();
  }

  @UseGuards(JwtGuard)
  @Access(TICKET_AGING)
  @Get('tickets/aging')
  async findTicketAging(
    @Query('queue') queue: string,
    @Query('team') team: string,
  ) {
    return this.reportsService.findTicketAging(queue, team);
  }

  @UseGuards(JwtGuard)
  @Access(TICKET_AGING)
  @Get('tickets/aging/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportTicketAging(
    @Query('queue') queue: string,
    @Query('team') team: string,
    @Res() res: Response,
  ) {
    const rows = await this.reportsService.findTicketAging(queue, team);
    const row = rows?.[0] ?? {};
    const csv = this.reportsService.formatAgingCsv(row, { queue, team });
    const part = (value: string) =>
      String(value || 'all').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ticket-aging-${part(team)}-${part(queue)}.csv"`,
    );
    res.send(csv);
  }

  @UseGuards(JwtGuard)
  @Access(TICKET_AGING)
  @Get('tickets/team')
  async findTicketsByTeam() {
    return this.reportsService.findTicketByTeam();
  }

  @UseGuards(JwtGuard)
  @Access(TICKET_AGING)
  @Get('tickets/team/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportTicketsByTeam(@Res() res: Response) {
    const data = await this.reportsService.findTicketByTeam();
    const csv = this.reportsService.formatTeamReportCsv(data);
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="tickets-by-team.csv"',
    );
    res.send(csv);
  }
}
