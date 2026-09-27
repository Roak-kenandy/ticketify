import {
  Controller,
  Get,
  Header,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtGuard } from 'src/auth/guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { DISPATCH_MANAGE_ROLES } from 'src/auth/ops-roles';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(DISPATCH_MANAGE_ROLES)
  @Get('tickets')
  async getTickets() {
    return this.reportsService.findTotalTickets();
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(DISPATCH_MANAGE_ROLES)
  @Get('queues')
  async getTicketQueues() {
    return this.reportsService.getTicketQueues();
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(DISPATCH_MANAGE_ROLES)
  @Get('teams')
  async getTeams() {
    return this.reportsService.getTeams();
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(DISPATCH_MANAGE_ROLES)
  @Get('tickets/aging')
  async findTicketAging(
    @Query('queue') queue: string,
    @Query('team') team: string,
  ) {
    return this.reportsService.findTicketAging(queue, team);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(DISPATCH_MANAGE_ROLES)
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
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ticket-aging-${team || 'all'}-${queue || 'all'}.csv"`,
    );
    res.send(csv);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(DISPATCH_MANAGE_ROLES)
  @Get('tickets/team')
  async findTicketsByTeam() {
    return this.reportsService.findTicketByTeam();
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(DISPATCH_MANAGE_ROLES)
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
