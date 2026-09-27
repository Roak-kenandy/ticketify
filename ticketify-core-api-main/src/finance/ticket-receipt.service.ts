import { Injectable } from '@nestjs/common';
import { Prisma, TicketInvoice, TicketPayment } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { FinanceSequenceService } from './finance-sequence.service';

@Injectable()
export class TicketReceiptService {
  constructor(
    private prisma: PrismaService,
    private sequences: FinanceSequenceService,
  ) {}

  async issueForPayment(
    invoice: TicketInvoice,
    payment: TicketPayment,
  ) {
    const existing = await this.prisma.ticketReceipt.findUnique({
      where: { payment_id: payment.id },
    });
    if (existing) {
      return existing;
    }

    const receiptNumber = await this.sequences.nextNumber('RCP');
    const lineItems = invoice.line_items;

    return this.prisma.ticketReceipt.create({
      data: {
        receipt_number: receiptNumber,
        invoice_id: invoice.id,
        payment_id: payment.id,
        crm_ticket_id: invoice.crm_ticket_id,
        sr_number: invoice.sr_number,
        subtotal_mvr: invoice.subtotal_mvr,
        tax_mvr: invoice.tax_mvr,
        amount_paid_mvr: payment.amount_mvr,
        line_items: lineItems as Prisma.InputJsonValue,
        snapshot: {
          invoice_number: invoice.invoice_number,
          payment_reference: payment.reference,
          bml_transaction_id: payment.bml_transaction_id,
          confirmed_at: payment.confirmed_at,
        } as Prisma.InputJsonValue,
      },
    });
  }

  async getByPaymentReference(reference: string) {
    const payment = await this.prisma.ticketPayment.findUnique({
      where: { reference },
      include: { receipt: true },
    });
    if (!payment?.receipt) {
      return null;
    }
    return payment.receipt;
  }

  async getByReceiptNumber(receiptNumber: string) {
    return this.prisma.ticketReceipt.findUnique({
      where: { receipt_number: receiptNumber },
      include: { invoice: true, payment: true },
    });
  }
}
