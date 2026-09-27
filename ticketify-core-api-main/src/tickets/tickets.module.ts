import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { LoggerModule } from 'src/infrastructure/logger/logger.module';
import { UserModule } from 'src/user/user.module';
import { SMSModule } from 'src/shared/ooredoo-sms/sms.module';
import { NotificationTemplateModule } from 'src/notifications/notification-template.module';
import { IntegrationAuditModule } from 'src/infrastructure/audit/integration-audit.module';
import { FinanceModule } from 'src/finance/finance.module';

@Module({
  controllers: [TicketsController],
  providers: [TicketsService],
  imports: [
    LoggerModule,
    UserModule,
    SMSModule,
    NotificationTemplateModule,
    IntegrationAuditModule,
    FinanceModule,
  ],
  exports: [TicketsService],
})
export class TicketsModule {}
