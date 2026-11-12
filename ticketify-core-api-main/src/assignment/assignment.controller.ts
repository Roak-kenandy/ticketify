import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { AssignmentEngineService } from './assignment-engine.service';
import { AssignmentSettingsService } from './assignment-settings.service';
import { AssignmentSchedulerService } from './assignment-scheduler.service';
import { RunAutoAssignDto } from './dto/run-auto-assign.dto';
import { UpdateAutoAssignSettingsDto } from './dto/update-auto-assign-settings.dto';
import { Access } from 'src/auth/access/access';
import { AUTO_ASSIGN_EDIT, AUTO_ASSIGN_VIEW } from 'src/auth/access/requirements';

@Controller('assignments')
export class AssignmentController {
  constructor(
    private engine: AssignmentEngineService,
    private settings: AssignmentSettingsService,
    private scheduler: AssignmentSchedulerService,
    private prisma: PrismaService,
  ) {}

  @UseGuards(JwtGuard)
  @Access(AUTO_ASSIGN_VIEW)
  @Get('settings')
  async getSettings() {
    const settings = await this.settings.getSettings();
    return { ...settings, regions: await this.settings.regions(settings) };
  }

  @UseGuards(JwtGuard)
  @Access(AUTO_ASSIGN_EDIT)
  @Patch('settings')
  async updateSettings(
    @Req() req: { user: { id: string } },
    @Body() body: UpdateAutoAssignSettingsDto,
  ) {
    const updated = await this.settings.update(body, req.user.id);
    if (updated.enabled) {
      this.scheduler.runSoon(req.user.id);
    }
    return { ...updated, regions: await this.settings.regions(updated) };
  }

  /** What the next run would do with the current settings. Read-only; nothing is assigned. */
  @UseGuards(JwtGuard)
  @Access(AUTO_ASSIGN_VIEW)
  @Get('preview')
  async preview() {
    return this.engine.runAutoAssign({ dry_run: true });
  }

  @UseGuards(JwtGuard)
  @Access(AUTO_ASSIGN_VIEW)
  @Get('activity')
  async activity() {
    const rows = await this.prisma.integrationAuditLog.findMany({
      where: {
        action: { in: ['AUTO_ASSIGN', 'MANUAL_ASSIGN', 'AUTO_ASSIGN_NO_CANDIDATE'] },
      },
      orderBy: { created_at: 'desc' },
      take: 30,
      select: { id: true, entity_id: true, action: true, new_state: true, created_at: true },
    });
    return rows.map(row => ({
      id: row.id,
      ticket_id: row.entity_id,
      action: row.action,
      created_at: row.created_at,
      ...((row.new_state as Record<string, unknown>) ?? {}),
    }));
  }

  @UseGuards(JwtGuard)
  @Access(AUTO_ASSIGN_EDIT)
  @Post('auto-run')
  async runAutoAssign(
    @Req() req: { user: { id: string } },
    @Body() body: RunAutoAssignDto,
  ) {
    const enabled = await this.settings.isAutoAssignEnabled();
    if (!enabled) {
      throw new ForbiddenException(
        'Auto-assign is off. Turn it on and set at least one category to Auto.',
      );
    }

    const results = await this.scheduler.runExclusive({
      team_id: body.team_id,
      max_assignments: body.max_assignments,
      actor_user_id: req.user.id,
    });
    if (!results) {
      throw new ConflictException('An auto-assign run is already in progress. Try again in a moment.');
    }
    return results;
  }
}
