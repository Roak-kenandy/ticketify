import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { OperationsDashboardService } from './operations-dashboard.service';
import { Access } from 'src/auth/access/access';
import { OPS_VIEW } from 'src/auth/access/requirements';

@Controller('dashboard')
export class DashboardController {
  constructor(private ops: OperationsDashboardService) {}

  @UseGuards(JwtGuard)
  @Access(OPS_VIEW)
  @Get('operations')
  operations() {
    return this.ops.getSnapshot();
  }
}
