import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { AssignmentEngineService } from './assignment-engine.service';
import { AssignmentSettingsService } from './assignment-settings.service';
import { RunAutoAssignDto } from './dto/run-auto-assign.dto';
import { UpdateAutoAssignSettingsDto } from './dto/update-auto-assign-settings.dto';

import { DISPATCH_MANAGE_ROLES } from 'src/auth/ops-roles';

const DISPATCH_ROLES = DISPATCH_MANAGE_ROLES;

@Controller('assignments')
export class AssignmentController {
  constructor(
    private engine: AssignmentEngineService,
    private settings: AssignmentSettingsService,
  ) {}

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(DISPATCH_ROLES)
  @Get('settings')
  async getSettings() {
    return this.settings.getSettings();
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(DISPATCH_ROLES)
  @Patch('settings')
  async updateSettings(
    @Req() req: { user: { id: string } },
    @Body() body: UpdateAutoAssignSettingsDto,
  ) {
    const updated = await this.settings.setEnabled(
      body.enabled,
      req.user.id,
      body.team_enabled,
    );

    if (body.enabled) {
      const results = await this.engine.runAutoAssign({
        actor_user_id: req.user.id,
      });
      await this.settings.recordLastRun(results);
      return { ...updated, immediate_run: results };
    }

    return updated;
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(DISPATCH_ROLES)
  @Post('auto-run')
  async runAutoAssign(
    @Req() req: { user: { id: string } },
    @Body() body: RunAutoAssignDto,
  ) {
    const enabled = await this.settings.isAutoAssignEnabled();
    if (!enabled) {
      throw new ForbiddenException(
        'Auto-assign is disabled. Enable it from dispatch settings.',
      );
    }

    const results = await this.engine.runAutoAssign({
      team_id: body.team_id,
      max_assignments: body.max_assignments,
      actor_user_id: req.user.id,
    });
    await this.settings.recordLastRun(results);
    return results;
  }
}
