import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  TicketBillingDecision,
  TicketInvoiceStatus,
  TicketPaymentStatus,
} from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';

export type BillingWorkflowView = {
  crm_ticket_id: string;
  decision: TicketBillingDecision;
  decided_at: Date | null;
  /** Chargeable path: customer must pay before close */
  payment_required: boolean;
  payment_status: 'none' | 'pending' | 'confirmed' | 'failed';
  open_invoice_id: string | null;
  open_invoice_number: string | null;
  pending_payment_reference: string | null;
  confirmed_receipt_number: string | null;
  can_close_ticket: boolean;
  block_close_reason: string | null;
  next_step:
    | 'decide_if_chargeable'
    | 'select_charges_and_pay'
    | 'await_customer_payment'
    | 'complete_work_then_close'
    | 'close_ticket';
};

@Injectable()
export class TicketBillingService {
  constructor(private prisma: PrismaService) {}

  async getOrCreate(crmTicketId: string) {
    return this.prisma.ticketBillingState.upsert({
      where: { crm_ticket_id: crmTicketId },
      create: { crm_ticket_id: crmTicketId },
      update: {},
    });
  }

  async setDecision(
    crmTicketId: string,
    chargeable: boolean,
    userId: string,
    notes?: string,
  ) {
    const decision = chargeable
      ? TicketBillingDecision.CHARGEABLE
      : TicketBillingDecision.NOT_CHARGEABLE;

    return this.prisma.ticketBillingState.upsert({
      where: { crm_ticket_id: crmTicketId },
      create: {
        crm_ticket_id: crmTicketId,
        decision,
        decided_by_user_id: userId,
        decided_at: new Date(),
        notes: notes?.trim() || null,
      },
      update: {
        decision,
        decided_by_user_id: userId,
        decided_at: new Date(),
        notes: notes?.trim() || null,
      },
    });
  }

  async getWorkflowView(crmTicketId: string): Promise<BillingWorkflowView> {
    const state = await this.getOrCreate(crmTicketId);

    const openInvoice = await this.prisma.ticketInvoice.findFirst({
      where: {
        crm_ticket_id: crmTicketId,
        status: { in: [TicketInvoiceStatus.DRAFT, TicketInvoiceStatus.ISSUED] },
      },
      orderBy: { created_at: 'desc' },
    });

    const pendingPayment = openInvoice
      ? await this.prisma.ticketPayment.findFirst({
          where: {
            crm_ticket_id: crmTicketId,
            invoice_id: openInvoice.id,
            status: TicketPaymentStatus.PENDING,
          },
          orderBy: { created_at: 'desc' },
        })
      : null;

    const confirmedPayment = await this.prisma.ticketPayment.findFirst({
      where: {
        crm_ticket_id: crmTicketId,
        status: TicketPaymentStatus.CONFIRMED,
      },
      orderBy: { confirmed_at: 'desc' },
      include: { receipt: true },
    });

    let payment_status: BillingWorkflowView['payment_status'] = 'none';
    if (confirmedPayment) {
      payment_status = 'confirmed';
    } else if (pendingPayment) {
      payment_status = 'pending';
    } else if (
      openInvoice &&
      (await this.prisma.ticketPayment.findFirst({
        where: {
          invoice_id: openInvoice.id,
          status: TicketPaymentStatus.FAILED,
        },
      }))
    ) {
      payment_status = 'failed';
    }

    const payment_required = state.decision === TicketBillingDecision.CHARGEABLE;
    let can_close_ticket = true;
    let block_close_reason: string | null = null;
    let next_step: BillingWorkflowView['next_step'] = 'close_ticket';

    if (state.decision === TicketBillingDecision.UNDECIDED) {
      next_step = 'decide_if_chargeable';
      can_close_ticket = false;
      block_close_reason =
        'Confirm whether this job is chargeable (materials/extra work) before closing.';
    } else if (state.decision === TicketBillingDecision.NOT_CHARGEABLE) {
      next_step = 'complete_work_then_close';
      can_close_ticket = true;
    } else if (payment_required) {
      if (!openInvoice && !confirmedPayment) {
        next_step = 'select_charges_and_pay';
        can_close_ticket = false;
        block_close_reason =
          'Select charges and send the customer a payment link.';
      } else if (payment_status === 'pending') {
        next_step = 'await_customer_payment';
        can_close_ticket = false;
        block_close_reason =
          'Waiting for customer payment. Use “Check payment” after they pay.';
      } else if (payment_status !== 'confirmed') {
        next_step = 'select_charges_and_pay';
        can_close_ticket = false;
        block_close_reason = 'Customer payment is not confirmed yet.';
      } else {
        next_step = 'complete_work_then_close';
        can_close_ticket = true;
      }
    }

    return {
      crm_ticket_id: crmTicketId,
      decision: state.decision,
      decided_at: state.decided_at,
      payment_required,
      payment_status,
      open_invoice_id: openInvoice?.id ?? null,
      open_invoice_number: openInvoice?.invoice_number ?? null,
      pending_payment_reference: pendingPayment?.reference ?? null,
      confirmed_receipt_number:
        confirmedPayment?.receipt?.receipt_number ?? null,
      can_close_ticket,
      block_close_reason,
      next_step,
    };
  }

  async assertReadyToClose(crmTicketId: string) {
    const view = await this.getWorkflowView(crmTicketId);
    if (!view.can_close_ticket) {
      throw new ForbiddenException(
        view.block_close_reason ?? 'Billing workflow is not complete',
      );
    }
    return view;
  }

  async markChargeableAfterPaymentInit(crmTicketId: string, userId: string) {
    const state = await this.getOrCreate(crmTicketId);
    if (state.decision === TicketBillingDecision.NOT_CHARGEABLE) {
      throw new BadRequestException(
        'Ticket was marked as not chargeable. Reset billing decision first.',
      );
    }
    if (state.decision === TicketBillingDecision.UNDECIDED) {
      await this.setDecision(crmTicketId, true, userId);
    }
  }
}
