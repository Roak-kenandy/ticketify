import { Module, forwardRef } from '@nestjs/common';
import { CrmApiModule } from 'src/infrastructure/crm/crm-api.module';
import { AuthModule } from 'src/auth/auth.module';
import { FinanceSequenceService } from './finance-sequence.service';
import { TicketInvoiceService } from './ticket-invoice.service';
import { TicketReceiptService } from './ticket-receipt.service';
import { InvoicesController, ReceiptsController } from './invoices.controller';
import { BillingController } from './billing.controller';
import { TicketBillingService } from './ticket-billing.service';
import { PaymentsModule } from 'src/payments/payments.module';
import { ChargesModule } from 'src/charges/charges.module';

@Module({
  imports: [
    CrmApiModule,
    AuthModule,
    ChargesModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [InvoicesController, ReceiptsController, BillingController],
  providers: [
    FinanceSequenceService,
    TicketInvoiceService,
    TicketReceiptService,
    TicketBillingService,
  ],
  exports: [
    FinanceSequenceService,
    TicketInvoiceService,
    TicketReceiptService,
    TicketBillingService,
  ],
})
export class FinanceModule {}
