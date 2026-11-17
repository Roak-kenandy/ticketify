import {
  BadRequestException,
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
import { Access } from 'src/auth/access/access';
import { FIELD } from 'src/auth/access/requirements';
import { isFmsTicketId } from 'src/infrastructure/ooredoo-fms/ooredoo-fms.types';

@Controller('billing/tickets')
export class BillingController {
  constructor(
    private billing: TicketBillingService,
    private payments: TicketPaymentService,
    private catalog: ChargeCatalogService,
    private crm: CrmApiClient,
  ) {}

  private assertNotFms(crmTicketId: string) {
    if (isFmsTicketId(crmTicketId)) {
      throw new BadRequestException('Ooredoo FMS tickets do not use charges');
    }
  }

  private fmsWorkflow(crmTicketId: string) {
    return {
      crm_ticket_id: crmTicketId,
      decision: 'NOT_CHARGEABLE' as const,
      decided_at: null,
      payment_required: false,
      payment_status: 'none' as const,
      open_invoice_id: null,
      open_invoice_number: null,
      pending_payment_reference: null,
      confirmed_receipt_number: null,
      can_close_ticket: true,
      block_close_reason: null,
      next_step: 'close_ticket' as const,
      source: 'OOREDOO',
    };
  }

  @UseGuards(JwtGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Access(FIELD)
  @Get(':crmTicketId/context')
  async context(@Param('crmTicketId') crmTicketId: string) {
    if (isFmsTicketId(crmTicketId)) {
      return {
        sr_number: crmTicketId,
        customer_name: null,
        default_payment_phone: null,
        gst_rate: this.catalog.gstRate(),
        currency: 'MVR',
        source: 'OOREDOO',
        charges_supported: false,
      };
    }
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

  @UseGuards(JwtGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Access(FIELD)
  @Post(':crmTicketId/preview')
  preview(
    @Param('crmTicketId') crmTicketId: string,
    @Body() body: ChargePreviewDto,
  ) {
    void crmTicketId;
    return this.catalog.resolveLines(body.items ?? []);
  }

  @UseGuards(JwtGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Access(FIELD)
  @Get(':crmTicketId/workflow')
  workflow(@Param('crmTicketId') crmTicketId: string) {
    if (isFmsTicketId(crmTicketId)) {
      return this.fmsWorkflow(crmTicketId);
    }
    return this.billing.getWorkflowView(crmTicketId);
  }

  @UseGuards(JwtGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Access(FIELD)
  @Patch(':crmTicketId/decision')
  decide(
    @Req() req: { user: { id: string } },
    @Param('crmTicketId') crmTicketId: string,
    @Body() body: BillingDecisionDto,
  ) {
    this.assertNotFms(crmTicketId);
    return this.billing.setDecision(
      crmTicketId,
      body.chargeable,
      req.user.id,
      body.notes,
    );
  }

  @UseGuards(JwtGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Access(FIELD)
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
