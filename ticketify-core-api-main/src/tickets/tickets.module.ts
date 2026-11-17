import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { StatusBoardService } from './status-board.service';
import { OoredooTicketsService } from './ooredoo-tickets.service';
import { TicketHelpersService } from './ticket-helpers.service';
import { TicketsController } from './tickets.controller';
import { LoggerModule } from 'src/infrastructure/logger/logger.module';
import { UserModule } from 'src/user/user.module';
import { SMSModule } from 'src/shared/ooredoo-sms/sms.module';
import { NotificationTemplateModule } from 'src/notifications/notification-template.module';
import { IntegrationAuditModule } from 'src/infrastructure/audit/integration-audit.module';
import { FinanceModule } from 'src/finance/finance.module';
import { ClosureModule } from 'src/closure/closure.module';
import { RequeueModule } from 'src/requeue/requeue.module';

@Module({
  controllers: [TicketsController],
  providers: [
    TicketsService,
    StatusBoardService,
    OoredooTicketsService,
    TicketHelpersService,
  ],
  imports: [
    LoggerModule,
    UserModule,
    SMSModule,
    NotificationTemplateModule,
    IntegrationAuditModule,
    FinanceModule,
    ClosureModule,
    RequeueModule,
  ],
  exports: [TicketsService, OoredooTicketsService, TicketHelpersService],
})
export class TicketsModule {}
