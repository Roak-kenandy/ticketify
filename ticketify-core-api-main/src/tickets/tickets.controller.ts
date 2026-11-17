import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { TicketsService } from './tickets.service';
import { StatusBoardService } from './status-board.service';
import { OoredooTicketsService } from './ooredoo-tickets.service';
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
import {
  FmsAddressDto,
  FmsAssignDto,
  FmsCategoryDto,
  FmsPriorityDto,
  FmsQueueDto,
  FmsStatusDto,
} from './dto/fms-edit.dto';
import { TicketAccessGuard } from 'src/infrastructure/security/ticket-access.guard';
import { Access } from 'src/auth/access/access';
import {
  CONSOLE_ANY,
  FIELD,
  OPS_VIEW,
  STATUS_BOARD,
} from 'src/auth/access/requirements';
import { isFmsTicketId } from 'src/infrastructure/ooredoo-fms/ooredoo-fms.types';

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
  user: {
    id: string;
    email?: string;
    crm_user_id: string;
    ooredoo_user_id?: string | null;
    source?: 'MEDIANET' | 'OOREDOO';
    name?: string;
    phone?: string;
    role?: string[];
  };
};

@UseGuards(JwtGuard)
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly statusBoard: StatusBoardService,
    private readonly ooredooTickets: OoredooTicketsService,
  ) {}

  private isOoredoo(req: AuthedRequest) {
    return this.ooredooTickets.isOoredooActor(req.user);
  }

  @Access(OPS_VIEW)
  @Get('all')
  async fetchAllTickets() {
    return this.ticketsService.findAllTickets();
  }

  /** Always scoped to the caller's own CRM / FMS user. */
  @Access(FIELD)
  @Get()
  async findAll(
    @Req() req: AuthedRequest,
    @Query('team_id') team_id?: string,
    @Query('state') state?: string,
  ): Promise<any> {
    if (this.isOoredoo(req)) {
      return this.ooredooTickets.listMine(req.user);
    }
    if (team_id || state) {
      return this.ticketsService.fetchServiceRequests(
        req.user.crm_user_id,
        team_id,
        state,
      );
    }
    return this.ticketsService.fetchMyTickets(req.user.crm_user_id);
  }

  @Access(OPS_VIEW)
  @Get('/team/:team_id')
  async fetchTicketsByTeam(@Param('team_id') team_id: string) {
    return this.ticketsService.fetchTeamServiceRequests(team_id);
  }

  @Access(OPS_VIEW)
  @Get('/user/:user_id')
  async fetchTicketsByUser(@Param('user_id') user_id: string) {
    return this.ticketsService.fetchUserTickets(user_id);
  }

  /** Technicians: their own tickets. Supervisors and above: every team. */
  @Access(STATUS_BOARD)
  @Get('status-board')
  async fetchStatusBoard(
    @Req() req: AuthedRequest,
    @Query('team') team?: string,
  ) {
    // Ooredoo has no CRM status buckets — derive Pending from FMS list only.
    if (this.isOoredoo(req)) {
      return this.ooredooTickets.statusBoard(req.user);
    }
    return this.statusBoard.board(req.user, team);
  }

  @Access(FIELD)
  @Get('teams')
  async fetchTeams(@Req() req: AuthedRequest) {
    // Ooredoo techs only see their own tickets — no shared team queue.
    if (this.isOoredoo(req)) {
      return [];
    }
    return this.ticketsService.findAllTeamTicketsSafe(req.user.crm_user_id);
  }

  @Access(CONSOLE_ANY)
  @Get('files/:file_id')
  async fetchFile(@Param('file_id') file_id: string, @Res() res: Response) {
    this.sendFile(res, await this.ticketsService.fetchFile(file_id));
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Get(':id/files/:file_id')
  async fetchTicketFile(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Param('file_id') file_id: string,
    @Res() res: Response,
  ) {
    if (this.isOoredoo(req) || isFmsTicketId(ticket_id)) {
      this.sendFile(
        res,
        await this.ooredooTickets.readAttachmentFile(ticket_id, file_id),
      );
      return;
    }
    this.sendFile(
      res,
      await this.ticketsService.fetchTicketFile(ticket_id, file_id),
    );
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Get(':id/activities/:activityId')
  getTicketActivity(
    @Param('id') ticket_id: string,
    @Param('activityId') activityId: string,
  ) {
    return this.ticketsService.getTicketActivity(ticket_id, activityId);
  }

  private sendFile(
    res: Response,
    file: { buffer: Buffer; contentType: string },
  ) {
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

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Put(':id/assign')
  async assign(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Body() body?: FmsAssignDto,
  ) {
    if (this.isOoredoo(req) || isFmsTicketId(ticket_id)) {
      const target = body?.user_id?.trim();
      if (target) {
        return this.ooredooTickets.assignToUser(
          ticket_id,
          target,
          req.user,
          body?.comment,
        );
      }
      return this.ooredooTickets.assignToMe(ticket_id, req.user);
    }
    return this.ticketsService.assignServiceRequestToUser(
      ticket_id,
      req.user.crm_user_id,
    );
  }

  /** FMS Change-modal dropdowns for this ticket (Ooredoo only). */
  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Get(':id/fms/options')
  fmsOptions(@Req() req: AuthedRequest, @Param('id') ticket_id: string) {
    this.assertOoredooTicket(req, ticket_id);
    return this.ooredooTickets.editOptions(ticket_id, req.user);
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Get(':id/fms/sub-categories/:categoryId')
  fmsSubCategories(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Param('categoryId') categoryId: string,
  ) {
    this.assertOoredooTicket(req, ticket_id);
    return this.ooredooTickets.listSubCategories(
      ticket_id,
      categoryId,
      req.user,
    );
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Patch(':id/fms/priority')
  fmsPriority(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Body() body: FmsPriorityDto,
  ) {
    this.assertOoredooTicket(req, ticket_id);
    return this.ooredooTickets.updatePriority(
      ticket_id,
      body.priority_id,
      body.comment,
      req.user,
    );
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Patch(':id/fms/status')
  fmsStatus(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Body() body: FmsStatusDto,
  ) {
    this.assertOoredooTicket(req, ticket_id);
    return this.ooredooTickets.updateStatus(
      ticket_id,
      body.ticket_status,
      body.ticket_sub_comment,
      body.comment,
      req.user,
    );
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Patch(':id/fms/queue')
  fmsQueue(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Body() body: FmsQueueDto,
  ) {
    this.assertOoredooTicket(req, ticket_id);
    return this.ooredooTickets.updateQueue(
      ticket_id,
      body.que_id,
      body.t_subcat,
      body.comment,
      req.user,
    );
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Patch(':id/fms/category')
  fmsCategory(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Body() body: FmsCategoryDto,
  ) {
    this.assertOoredooTicket(req, ticket_id);
    return this.ooredooTickets.updateCategory(
      ticket_id,
      body.category,
      body.sub_category,
      body.comment,
      req.user,
    );
  }

  /** Relocation-only: locked identity + editable installation address. */
  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Get(':id/fms/address')
  fmsAddressForm(@Req() req: AuthedRequest, @Param('id') ticket_id: string) {
    this.assertOoredooTicket(req, ticket_id);
    return this.ooredooTickets.addressForm(ticket_id, req.user);
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Get(':id/fms/islands')
  fmsIslands(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Query('atoll_id') atoll_id: string,
  ) {
    this.assertOoredooTicket(req, ticket_id);
    return this.ooredooTickets.listIslands(ticket_id, atoll_id, req.user);
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Patch(':id/fms/address')
  fmsAddress(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Body() body: FmsAddressDto,
  ) {
    this.assertOoredooTicket(req, ticket_id);
    return this.ooredooTickets.updateAddress(ticket_id, body, req.user);
  }

  private assertOoredooTicket(req: AuthedRequest, ticketId: string) {
    if (!(this.isOoredoo(req) || isFmsTicketId(ticketId))) {
      throw new BadRequestException('FMS edits are only for Ooredoo tickets');
    }
  }

  @Access(FIELD)
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

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Put(':id/start')
  async start(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Body() body: StartTicketDto,
  ) {
    if (this.isOoredoo(req) || isFmsTicketId(ticket_id)) {
      return this.ooredooTickets.getDetail(ticket_id, req.user);
    }
    return this.ticketsService.startTicket(ticket_id, body?.stage_id);
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Put(':id/progress')
  async progress(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Body() body: ProgressTicketDto,
    @Query('smsNotification') smsNotificationRaw?: string,
  ) {
    if (this.isOoredoo(req) || isFmsTicketId(ticket_id)) {
      throw new BadRequestException(
        'Ooredoo tickets close directly — use Complete instead of Progress',
      );
    }
    return this.ticketsService.progressTicket(
      ticket_id,
      body.stage_id,
      body.stage_name ?? '',
      body.comment ?? '',
      smsNotificationRaw === 'true',
    );
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Put(':id/complete')
  async complete(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Body() body: CompleteTicketDto,
  ) {
    if (this.isOoredoo(req) || isFmsTicketId(ticket_id)) {
      return this.ooredooTickets.complete(
        ticket_id,
        body.comment ?? '',
        body.closing_sub_comment,
        req.user,
      );
    }
    return this.ticketsService.completeTicket(
      ticket_id,
      body.comment,
      body.stage_id,
      req.user.id,
    );
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Post(':id/notes')
  async addNoteToTicket(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
    @Body() body: AddNoteDto,
  ) {
    const note = `${req.user.name ?? 'Technician'}\n\n${body.note.trim()}`;
    if (this.isOoredoo(req) || isFmsTicketId(ticket_id)) {
      return this.ooredooTickets.addNote(ticket_id, note, req.user);
    }
    return this.ticketsService.crmAddNoteToTicket(
      ticket_id,
      note,
      body.pinned ?? false,
    );
  }

  @Access(FIELD)
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
    if (this.isOoredoo(req) || isFmsTicketId(ticket_id)) {
      if (!file) {
        throw new BadRequestException('Attach a file');
      }
      return this.ooredooTickets.uploadAttachment(
        ticket_id,
        file,
        body?.description ?? '',
        req.user,
      );
    }
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

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Throttle(SMS_THROTTLE)
  @Put(':id/no-response')
  async findTicketTag(@Param('id') ticket_id: string) {
    return this.ticketsService.toggleNoResponse(ticket_id);
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Get(':id/context')
  async findTicketActivitiesContext(
    @Req() req: AuthedRequest,
    @Param('id') ticket_id: string,
  ) {
    if (this.isOoredoo(req) || isFmsTicketId(ticket_id)) {
      return this.ooredooTickets.emptyContext(ticket_id);
    }
    return this.ticketsService.findTicketActivitiesContext(ticket_id);
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Get(':id/lm/context')
  async lmHandoffContext(@Param('id') ticket_id: string) {
    return this.ticketsService.getLmHandoffContext(ticket_id);
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Get(':id/lm')
  async listLmActivities(@Param('id') ticket_id: string) {
    return this.ticketsService.listLastMileActivities(ticket_id);
  }

  @Access(FIELD)
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

  @Access(FIELD)
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

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Post(':id/activities')
  async createActivity(
    @Param('id') ticket_id: string,
    @Body() body: CreateActivityDto,
  ) {
    return this.ticketsService.createActivity(ticket_id, body);
  }

  @Access(FIELD)
  @UseGuards(TicketAccessGuard)
  @Get(':id')
  findOne(@Req() req: AuthedRequest, @Param('id') crm_id: string) {
    if (this.isOoredoo(req) || isFmsTicketId(crm_id)) {
      return this.ooredooTickets.getDetail(crm_id, req.user);
    }
    return this.ticketsService.crmFindServiceRequest(crm_id);
  }
}
