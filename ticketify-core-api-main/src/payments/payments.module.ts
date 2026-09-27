import { Module, forwardRef } from '@nestjs/common';
import { BmlPaymentService } from './bml-payment.service';
import { TicketPaymentService } from './ticket-payment.service';
import { PaymentsController } from './payments.controller';
import { IntegrationAuditModule } from 'src/infrastructure/audit/integration-audit.module';
import { CrmApiModule } from 'src/infrastructure/crm/crm-api.module';
import { AuthModule } from 'src/auth/auth.module';
import { FinanceModule } from 'src/finance/finance.module';
import { ChargesModule } from 'src/charges/charges.module';
import { SMSModule } from 'src/shared/ooredoo-sms/sms.module';
import { NotificationTemplateModule } from 'src/notifications/notification-template.module';

@Module({
  imports: [
    IntegrationAuditModule,
    CrmApiModule,
    AuthModule,
    ChargesModule,
    SMSModule,
    NotificationTemplateModule,
    forwardRef(() => FinanceModule),
  ],
  controllers: [PaymentsController],
  providers: [BmlPaymentService, TicketPaymentService],
  exports: [BmlPaymentService, TicketPaymentService],
})
export class PaymentsModule {}
