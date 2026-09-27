import { Module } from '@nestjs/common';
import { OperationsDashboardService } from './operations-dashboard.service';
import { DashboardController } from './dashboard.controller';
import { DispatchModule } from 'src/dispatch/dispatch.module';
import { AuthModule } from 'src/auth/auth.module';
import { TicketsModule } from 'src/tickets/tickets.module';

@Module({
  imports: [DispatchModule, TicketsModule, AuthModule],
  controllers: [DashboardController],
  providers: [OperationsDashboardService],
})
export class DashboardModule {}
