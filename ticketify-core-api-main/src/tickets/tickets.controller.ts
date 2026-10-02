import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtGuard } from 'src/auth/guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketsService } from './tickets.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateActivityDto } from './dto/create-activity';
import { ScheduleVisitDto } from 'src/config/dto/schedule-visit.dto';
import { LmHandoffDto } from './dto/lm-handoff.dto';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  async create(@Body() createTicketDto: any) {
    console.log(createTicketDto.data);
    return await this.ticketsService.create(createTicketDto.data);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(['Admin', 'Supervisor', 'Administrator'])
  @Get('all')
  async fetchAllTickets() {
    return this.ticketsService.findAllTickets();
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Get()
  async findAll(
    @Req()
    req: {
      user: {
        crm_user_id: string;
      };
    },
    @Query('team_id') team_id?: string,
    @Query('state') state?: string,
  ): Promise<any> {
    if (team_id || state) {
      return this.ticketsService.fetchServiceRequests(
        req.user.crm_user_id,
        team_id,
        state,
      );
    }
    return this.ticketsService.fetchMyTickets(req.user.crm_user_id);
  }

  @UseGuards(JwtGuard)
  @Get('/team/:team_id')
  async fetchTicketsByTeam(@Param('team_id') team_id: string) {
    return this.ticketsService.fetchTeamServiceRequests(team_id);
  }

  @UseGuards(JwtGuard)
  @Get('/user/:user_id')
  async fetchTicketsByUser(@Param('user_id') user_id: string) {
    return this.ticketsService.fetchUserTickets(user_id);
  }

  // Fetch all team tickets
  @UseGuards(JwtGuard)
  @Get('teams')
  async fetchTeams(
    @Req()
    req: {
      user: {
        crm_user_id: string;
      };
    },
  ) {
    return this.ticketsService.findAllTeamTicketsSafe(req.user.crm_user_id);
  }

  @UseGuards(JwtGuard)
  @Get('files/:file_id')
  async fetchFile(@Param('file_id') file_id: string, @Res() res: Response) {
    const file = await this.ticketsService.fetchFile(file_id);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.buffer.length));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(file.buffer);
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Put(':id')
  async update(
    @Req()
    req: {
      user: {
        crm_user_id: string;
      };
    },
    @Param('id') crm_id: string,
    @Body() updateTicketDto: UpdateTicketDto,
  ) {
    return this.ticketsService.updateTicket(req.user, crm_id, updateTicketDto);
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Put(':id/assign')
  async assign(
    @Req()
    req: {
      user: {
        crm_user_id: string;
      };
    },
    @Param('id') ticket_id: string,
  ) {
    return this.ticketsService.assignServiceRequestToUser(
      ticket_id,
      req.user.crm_user_id,
    );
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Put(':id/schedule')
  async scheduleVisit(
    @Req() req: { user: { id: string; name?: string; phone?: string } },
    @Param('id') ticket_id: string,
    @Body() body: ScheduleVisitDto,
  ) {
    return this.ticketsService.scheduleVisit(ticket_id, req.user, body);
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Put(':id/start')
  async start(
    @Req()
    req: {
      user: {
        crm_user_id: string;
      };
    },
    @Param('id') ticket_id: string,
    @Body() body?: { stage_id?: string },
  ) {
    return this.ticketsService.startTicket(ticket_id, body?.stage_id);
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Put(':id/progress')
  async progress(
    @Req()
    req: {
      user: {
        crm_user_id: string;
      };
    },
    @Param('id') ticket_id: string,
    @Body()
    body: {
      comment: string;
      stage_id: string;
      stage_name: string;
    },
    @Query('smsNotification')
    @Query('smsNotification')
    smsNotificationRaw: string,
  ) {
    // change smsNotification to boolean
    const smsNotificationBoolean = smsNotificationRaw === 'true';

    return this.ticketsService.progressTicket(
      ticket_id,
      body.stage_id,
      body.stage_name,
      body.comment,
      smsNotificationBoolean,
    );
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Put(':id/complete')
  async complete(
    @Req()
    req: {
      user: {
        crm_user_id: string;
      };
    },
    @Param('id') ticket_id: string,
    @Body() body: any,
  ) {
    console.log(body);
    return this.ticketsService.completeTicket(
      ticket_id,
      body.comment,
      body.stage_id,
    );
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Post(':id/notes')
  async addNoteToTicket(
    @Req()
    req: {
      user: {
        crm_user_id: string;
        name: string;
      };
    },
    @Param('id') ticket_id: string,
    @Body() body: any,
  ) {
    let note = `
${req.user.name}

${body.note} 
    `;

    return this.ticketsService.crmAddNoteToTicket(ticket_id, note, body.pinned);
  }

  @UseGuards(JwtGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024, files: 1 } }),
  )
  @Post(':id/attachments')
  async uploadAttachmentToTicket(
    @Req()
    req: {
      user: {
        crm_user_id: string;
      };
    },
    @Param('id') ticket_id: string,
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      return this.ticketsService.uploadDeviceFileToTicket(
        ticket_id,
        file,
        body?.description,
      );
    }
    return this.ticketsService.uploadAttachmentToTicket(
      ticket_id,
      req.user.crm_user_id,
      body.description,
      body.file_id,
    );
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Put(':id/no-response')
  async findTicketTag(@Param('id') ticket_id: string) {
    return this.ticketsService.toggleNoResponse(ticket_id);
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Get(':id/context')
  async findTicketActivitiesContext(@Param('id') ticket_id: string) {
    return this.ticketsService.findTicketActivitiesContext(ticket_id);
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Get(':id/lm/context')
  async lmHandoffContext(@Param('id') ticket_id: string) {
    return this.ticketsService.getLmHandoffContext(ticket_id);
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Get(':id/lm')
  async listLmActivities(@Param('id') ticket_id: string) {
    return this.ticketsService.listLastMileActivities(ticket_id);
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Post(':id/lm/handoff')
  async lmHandoff(
    @Req() req: { user: { id: string; name?: string } },
    @Param('id') ticket_id: string,
    @Body() body: LmHandoffDto,
  ) {
    return this.ticketsService.handoffToLastMile(ticket_id, body, req.user);
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Put(':id/lm/activities/:activityId/complete')
  async completeLmActivity(
    @Req() req: { user: { id: string; name?: string } },
    @Param('activityId') activityId: string,
  ) {
    return this.ticketsService.completeLastMileActivity(activityId, req.user);
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Post(':id/activities')
  async createActivity(
    @Req()
    req: {
      user: {
        crm_user_id: string;
      };
    },
    @Param('id') ticket_id: string,
    @Body() body: CreateActivityDto,
  ) {
    return this.ticketsService.createActivity(ticket_id, body);
  }

  @UseGuards(JwtGuard)
  @Roles(['TECHNICIAN'])
  @Get(':id')
  findOne(@Param('id') crm_id: string) {
    return this.ticketsService.crmFindServiceRequest(crm_id);
  }
}
