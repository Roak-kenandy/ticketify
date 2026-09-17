import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('tickets')
  async getTickets() {
    return this.reportsService.findTotalTickets();
  }

  @Get('queues')
  async getTicketQueues() {
    return this.reportsService.getTicketQueues();
  }

  @Get('teams')
  async getTeams() {
    return this.reportsService.getTeams();
  }

  @Get('tickets/aging')
  async findTicketAging(
    @Query('queue') queue: string,
    @Query('team') team: string,
  ) {
    console.log(queue, team);

    return this.reportsService.findTicketAging(queue, team);
  }

  @Get('tickets/team')
  async findTicketsByTeam() {
    return this.reportsService.findTicketByTeam();
  }
}
