import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { OperationsDashboardService } from './operations-dashboard.service';
import { OPS_VIEW_ROLES } from 'src/auth/ops-roles';

@Controller('dashboard')
export class DashboardController {
  constructor(private ops: OperationsDashboardService) {}

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(OPS_VIEW_ROLES)
  @Get('operations')
  operations() {
    return this.ops.getSnapshot();
  }
}
