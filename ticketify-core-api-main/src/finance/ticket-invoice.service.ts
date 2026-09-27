import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TicketInvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';
import { FinanceSequenceService } from './finance-sequence.service';
import { addTaxToSubtotal, parseGstRate } from './tax.util';
import {
  ChargeCatalogService,
  ChargeLineInput,
} from 'src/charges/charge-catalog.service';

export type InvoiceLineItem = {
  code: string;
  label: string;
  amount_mvr: string;
  quantity?: number;
};

@Injectable()
export class TicketInvoiceService {
  constructor(
    private prisma: PrismaService,
    private crm: CrmApiClient,
    private sequences: FinanceSequenceService,
    private config: ConfigService,
    private chargeCatalog: ChargeCatalogService,
  ) {}

  private gstRate(): number {
    return parseGstRate(this.config.get<string>('TICKETIFY_GST_RATE'));
  }

  async listForTicket(crmTicketId: string) {
    return this.prisma.ticketInvoice.findMany({
      where: { crm_ticket_id: crmTicketId },
      orderBy: { created_at: 'desc' },
      include: { receipt: true },
    });
  }

  async getById(id: string) {
    const invoice = await this.prisma.ticketInvoice.findUnique({
      where: { id },
      include: { receipt: true, payments: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  async createFromLineItems(
    crmTicketId: string,
    items: ChargeLineInput[],
    createdByUserId?: string,
    issue = true,
  ) {
    const sr = await this.crm.getServiceRequest(crmTicketId);
    if (!sr.ok) {
      throw new NotFoundException('CRM service request not found');
    }
    const srData = sr.data as { number?: string };

    const resolved = await this.chargeCatalog.resolveLines(items);
    const lineItems: InvoiceLineItem[] = resolved.lines.map(l => ({
      code: l.code,
      label: l.label,
      amount_mvr: l.unit_amount_mvr,
      quantity: l.quantity,
      line_total_mvr: l.line_total_mvr,
    }));

    const invoiceNumber = await this.sequences.nextNumber('INV');

    return this.prisma.ticketInvoice.create({
      data: {
        invoice_number: invoiceNumber,
        crm_ticket_id: crmTicketId,
        sr_number: srData?.number ?? null,
        status: issue ? TicketInvoiceStatus.ISSUED : TicketInvoiceStatus.DRAFT,
        subtotal_mvr: resolved.subtotal_mvr,
        tax_mvr: resolved.tax_mvr,
        total_mvr: resolved.total_mvr,
        gst_rate: resolved.gst_rate,
        line_items: lineItems as unknown as Prisma.InputJsonValue,
        created_by_user_id: createdByUserId,
        issued_at: issue ? new Date() : null,
      },
    });
  }

  async createFromChargeCodes(
    crmTicketId: string,
    chargeCodes: string[],
    createdByUserId?: string,
    issue = true,
  ) {
    return this.createFromLineItems(
      crmTicketId,
      chargeCodes.map(code => ({ code, quantity: 1 })),
      createdByUserId,
      issue,
    );
  }

  async markPaid(invoiceId: string) {
    return this.prisma.ticketInvoice.update({
      where: { id: invoiceId },
      data: {
        status: TicketInvoiceStatus.PAID,
        paid_at: new Date(),
      },
    });
  }

  async voidInvoice(invoiceId: string) {
    const invoice = await this.getById(invoiceId);
    if (invoice.status === TicketInvoiceStatus.PAID) {
      throw new BadRequestException('Paid invoices cannot be voided');
    }
    return this.prisma.ticketInvoice.update({
      where: { id: invoiceId },
      data: { status: TicketInvoiceStatus.VOID },
    });
  }
}
