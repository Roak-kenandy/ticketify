import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import {
  TicketAccessGuard,
  TicketScope,
} from 'src/infrastructure/security/ticket-access.guard';
import { BillingDecisionDto } from './dto/billing-decision.dto';
import { TicketBillingService } from './ticket-billing.service';
import { TicketPaymentService } from 'src/payments/ticket-payment.service';
import { ChargeCatalogService } from 'src/charges/charge-catalog.service';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';
import { ChargePreviewDto } from 'src/payments/dto/charge-line.dto';

const ROLES = ['Technician', 'Admin', 'Supervisor', 'Administrator'];

@Controller('billing/tickets')
export class BillingController {
  constructor(
    private billing: TicketBillingService,
    private payments: TicketPaymentService,
    private catalog: ChargeCatalogService,
    private crm: CrmApiClient,
  ) {}

  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(ROLES)
  @Get(':crmTicketId/context')
  async context(@Param('crmTicketId') crmTicketId: string) {
    const sr = await this.crm.getServiceRequest(
      encodeURIComponent(crmTicketId),
    );
    const data = sr.data as {
      number?: string;
      contact?: {
        phone?: { number?: string };
        person_name?: { full_name?: string };
      };
    };
    return {
      sr_number: data?.number ?? null,
      customer_name: data?.contact?.person_name?.full_name ?? null,
      default_payment_phone: data?.contact?.phone?.number ?? null,
      gst_rate: this.catalog.gstRate(),
      currency: 'MVR',
    };
  }

  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(ROLES)
  @Post(':crmTicketId/preview')
  preview(
    @Param('crmTicketId') crmTicketId: string,
    @Body() body: ChargePreviewDto,
  ) {
    void crmTicketId;
    return this.catalog.resolveLines(body.items ?? []);
  }

  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(ROLES)
  @Get(':crmTicketId/workflow')
  workflow(@Param('crmTicketId') crmTicketId: string) {
    return this.billing.getWorkflowView(crmTicketId);
  }

  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(ROLES)
  @Patch(':crmTicketId/decision')
  decide(
    @Req() req: { user: { id: string } },
    @Param('crmTicketId') crmTicketId: string,
    @Body() body: BillingDecisionDto,
  ) {
    return this.billing.setDecision(
      crmTicketId,
      body.chargeable,
      req.user.id,
      body.notes,
    );
  }

  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(ROLES)
  @Post(':crmTicketId/check-payment')
  async checkPayment(@Param('crmTicketId') crmTicketId: string) {
    const view = await this.billing.getWorkflowView(crmTicketId);
    if (!view.pending_payment_reference) {
      return {
        ...view,
        message: 'No pending payment to check',
      };
    }
    await this.payments.reconcile(view.pending_payment_reference);
    return this.billing.getWorkflowView(crmTicketId);
  }
}
