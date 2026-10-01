import { Module } from '@nestjs/common';
import { AssignmentEngineService } from './assignment-engine.service';
import { AssignmentSettingsService } from './assignment-settings.service';
import { AssignmentSchedulerService } from './assignment-scheduler.service';
import { AssignmentNotifierService } from './assignment-notifier.service';
import { AssignmentController } from './assignment.controller';
import { TicketsModule } from 'src/tickets/tickets.module';
import { UserModule } from 'src/user/user.module';
import { IntegrationAuditModule } from 'src/infrastructure/audit/integration-audit.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [TicketsModule, UserModule, IntegrationAuditModule, AuthModule],
  controllers: [AssignmentController],
  providers: [
    AssignmentEngineService,
    AssignmentSettingsService,
    AssignmentSchedulerService,
    AssignmentNotifierService,
  ],
  exports: [AssignmentEngineService, AssignmentSettingsService, AssignmentNotifierService],
})
export class AssignmentModule {}
