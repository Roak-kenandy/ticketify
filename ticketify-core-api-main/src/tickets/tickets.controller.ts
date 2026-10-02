import {
  BadRequestException,
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
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtGuard } from 'src/auth/guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { TicketsService } from './tickets.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateActivityDto } from './dto/create-activity';
import { ScheduleVisitDto } from 'src/config/dto/schedule-visit.dto';
import { LmHandoffDto } from './dto/lm-handoff.dto';
import {
  AddNoteDto,
  AttachmentDto,
  CompleteTicketDto,
  ProgressTicketDto,
  StartTicketDto,
} from './dto/ticket-actions.dto';
import { FIELD_ROLES, OPS_VIEW_ROLES } from 'src/auth/ops-roles';
import { TicketAccessGuard } from 'src/infrastructure/security/ticket-access.guard';

const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

/** Only these are rendered inline; anything else is forced to download. */
const INLINE_FILE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

/** SMS-sending actions: cost and spam protection. */
const SMS_THROTTLE = { default: { limit: 10, ttl: 60000 } };

type AuthedRequest = {
  user: { id: string; crm_user_id: string; name?: string; phone?: string };
};

@UseGuards(JwtGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Roles(['Admin', 'Supervisor', 'Administrator'])
  @Get('all')
  async fetchAllTickets() {
    return this.ticketsService.findAllTickets();
  }

  /** Always scoped to the caller's own CRM user. */
  @Roles(FIELD_ROLES)
  @Get()
  async findAll(
    @Req() req: AuthedRequest,
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

  @Roles(OPS_VIEW_ROLES)
  @Get('/team/:team_id')
  async fetchTicketsByTeam(@Param('team_id') team_id: string) {
    return this.ticketsService.fetchTeamServiceRequests(team_id);
  }

  @Roles(OPS_VIEW_ROLES)
  @Get('/user/:user_id')
  async fetchTicketsByUser(@Param('user_id') user_id: string) {
    return this.ticketsService.fetchUserTickets(user_id);
  }

  @Get('teams')
  async fetchTeams(@Req() req: AuthedRequest) {
    return this.ticketsService.findAllTeamTicketsSafe(req.user.crm_user_id);
  }

  @Get('files/:file_id')
  async fetchFile(@Param('file_id') file_id: string, @Res() res: Response) {
    const file = await this.ticketsService.fetchFile(file_id);
    const type = String(file.contentType ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const inline = INLINE_FILE_TYPES.has(type);
    res.setHeader('Content-Type', inline ? type : 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      inline ? 'inline' : 'attachment; filename="attachment"',
    );
    res.setHeader('Content-Length', String(file.buffer.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
    );
    res.send(file.buffer);
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Put(':id/assign')
  async assign(@Req() req: AuthedRequest, @Param('id') ticket_id: string) {
    return this.ticketsService.assignServiceRequestToUser(
      ticket_id,
      req.user.crm_user_id,
    );
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Put(':id/schedule')
  async scheduleVisit(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Body() body: ScheduleVisitDto,
  ) {
    return this.ticketsService.scheduleVisit(ticket_id, req.user, body);
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @Put(':id/start')
  async start(@Param('id') ticket_id: string, @Body() body: StartTicketDto) {
    return this.ticketsService.startTicket(ticket_id, body?.stage_id);
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Put(':id/progress')
  async progress(
    @Param('id') ticket_id: string,
    @Body() body: ProgressTicketDto,
    @Query('smsNotification') smsNotificationRaw?: string,
  ) {
    return this.ticketsService.progressTicket(
      ticket_id,
      body.stage_id,
      body.stage_name ?? '',
      body.comment ?? '',
      smsNotificationRaw === 'true',
    );
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Put(':id/complete')
  async complete(
    @Param('id') ticket_id: string,
    @Body() body: CompleteTicketDto,
  ) {
    return this.ticketsService.completeTicket(
      ticket_id,
      body.comment,
      body.stage_id,
    );
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @Post(':id/notes')
  async addNoteToTicket(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Body() body: AddNoteDto,
  ) {
    const note = `${req.user.name ?? 'Technician'}\n\n${body.note.trim()}`;
    return this.ticketsService.crmAddNoteToTicket(
      ticket_id,
      note,
      body.pinned ?? false,
    );
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 5 },
      fileFilter: (_req, file, callback) => {
        if (!ALLOWED_UPLOAD_TYPES.has(String(file.mimetype).toLowerCase())) {
          return callback(
            new BadRequestException(
              'Only photos (JPEG, PNG, WebP, HEIC) and PDF files can be attached',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  @Post(':id/attachments')
  async uploadAttachmentToTicket(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Body() body: AttachmentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      return this.ticketsService.uploadDeviceFileToTicket(
        ticket_id,
        file,
        body?.description,
      );
    }
    if (!body.file_id) {
      throw new BadRequestException('Attach a file');
    }
    return this.ticketsService.uploadAttachmentToTicket(
      ticket_id,
      req.user.crm_user_id,
      body.description,
      body.file_id,
    );
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Put(':id/no-response')
  async findTicketTag(@Param('id') ticket_id: string) {
    return this.ticketsService.toggleNoResponse(ticket_id);
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @Get(':id/context')
  async findTicketActivitiesContext(@Param('id') ticket_id: string) {
    return this.ticketsService.findTicketActivitiesContext(ticket_id);
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @Get(':id/lm/context')
  async lmHandoffContext(@Param('id') ticket_id: string) {
    return this.ticketsService.getLmHandoffContext(ticket_id);
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @Get(':id/lm')
  async listLmActivities(@Param('id') ticket_id: string) {
    return this.ticketsService.listLastMileActivities(ticket_id);
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Post(':id/lm/handoff')
  async lmHandoff(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Body() body: LmHandoffDto,
  ) {
    return this.ticketsService.handoffToLastMile(ticket_id, body, req.user);
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @Put(':id/lm/activities/:activityId/complete')
  async completeLmActivity(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Param('activityId') activityId: string,
  ) {
    const activities =
      await this.ticketsService.listLastMileActivities(ticket_id);
    if (!activities.some((activity) => activity.id === activityId)) {
      throw new BadRequestException(
        'This Last Mile activity does not belong to the ticket',
      );
    }
    return this.ticketsService.completeLastMileActivity(activityId, req.user);
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @Post(':id/activities')
  async createActivity(
    @Param('id') ticket_id: string,
    @Body() body: CreateActivityDto,
  ) {
    return this.ticketsService.createActivity(ticket_id, body);
  }

  @Roles(FIELD_ROLES)
  @UseGuards(TicketAccessGuard)
  @Get(':id')
  findOne(@Param('id') crm_id: string) {
    return this.ticketsService.crmFindServiceRequest(crm_id);
  }
}
