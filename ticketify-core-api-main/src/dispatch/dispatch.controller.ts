import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { DispatchService } from './dispatch.service';
import { Access } from 'src/auth/access/access';
import { DISPATCH_ASSIGN, OPS_VIEW } from 'src/auth/access/requirements';

@Controller('dispatch')
export class DispatchController {
  constructor(private dispatch: DispatchService) {}

  @UseGuards(JwtGuard)
  @Access(OPS_VIEW)
  @Get('overview')
  overview() {
    return this.dispatch.overview();
  }

  @UseGuards(JwtGuard)
  @Access(OPS_VIEW)
  @Get('unassigned')
  unassigned(@Query('team_id') teamId: string) {
    return this.dispatch.unassignedByTeam(teamId);
  }

  @UseGuards(JwtGuard)
  @Access(DISPATCH_ASSIGN)
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
