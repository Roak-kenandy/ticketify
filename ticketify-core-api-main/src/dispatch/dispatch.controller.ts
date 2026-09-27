import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { DispatchService } from './dispatch.service';

import { DISPATCH_MANAGE_ROLES, OPS_VIEW_ROLES } from 'src/auth/ops-roles';

@Controller('dispatch')
export class DispatchController {
  constructor(private dispatch: DispatchService) {}

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(OPS_VIEW_ROLES)
  @Get('overview')
  overview() {
    return this.dispatch.overview();
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(OPS_VIEW_ROLES)
  @Get('unassigned')
  unassigned(@Query('team_id') teamId: string) {
    return this.dispatch.unassignedByTeam(teamId);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(DISPATCH_MANAGE_ROLES)
  @Post('assign/:ticketId')
  assign(
    @Req() req: { user: { id: string } },
    @Param('ticketId') ticketId: string,
    @Body() body: { crm_user_id: string },
  ) {
    return this.dispatch.manualAssign(
      ticketId,
      body.crm_user_id,
      req.user.id,
    );
  }
}
