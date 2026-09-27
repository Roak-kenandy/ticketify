import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TicketPaymentStatus } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';
import { TicketInvoiceService } from 'src/finance/ticket-invoice.service';
import { TicketReceiptService } from 'src/finance/ticket-receipt.service';
import { TicketBillingService } from 'src/finance/ticket-billing.service';
import { BmlPaymentService } from './bml-payment.service';
import { ChargeCatalogService, ChargeLineInput } from 'src/charges/charge-catalog.service';
import SMSService from 'src/shared/ooredoo-sms/sms.service';
import { NotificationTemplateService } from 'src/notifications/notification-template.service';
import { CreateTicketPaymentDto } from './dto/create-ticket-payment.dto';

@Injectable()
export class TicketPaymentService {
  constructor(
    private prisma: PrismaService,
    private bml: BmlPaymentService,
    private crm: CrmApiClient,
    private config: ConfigService,
    private audit: IntegrationAuditService,
    private invoices: TicketInvoiceService,
    private receipts: TicketReceiptService,
    private billing: TicketBillingService,
    private chargeCatalog: ChargeCatalogService,
    private sms: SMSService,
    private templates: NotificationTemplateService,
  ) {}

  private buildReference(): string {
    return `TKT-PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private allowLocalhostPaymentLinks(): boolean {
    return (
      this.config.get<string>('ALLOW_LOCALHOST_PAYMENT_LINKS') === 'true' ||
      (this.config.get<string>('NODE_ENV') ?? 'development') !== 'production'
    );
  }

  /** Base URL embedded in customer SMS (must be phone-reachable in production). */
  private customerLinkBase(): string {
    const explicit =
      this.config.get<string>('PAYMENT_SMS_LINK_BASE')?.trim() ||
      this.config.get<string>('PUBLIC_API_BASE_URL')?.trim();
    if (explicit) {
      return explicit.replace(/\/$/, '');
    }
    const apiUrl = this.config.get<string>('API_URL')?.trim();
    if (apiUrl) {
      return apiUrl.replace(/\/$/, '');
    }
    return 'http://127.0.0.1:3333/api/v1';
  }

  /** Fix common dev mistakes: https on local HTTP server, admin port 3000 vs API 3333. */
  private normalizeSmsPaymentUrl(url: string): string {
    try {
      const u = new URL(url);
      const local =
        u.hostname === 'localhost' ||
        u.hostname === '127.0.0.1' ||
        u.hostname === '10.0.2.2';
      if (local && u.protocol === 'https:') {
        u.protocol = 'http:';
      }
      if (
        local &&
        u.pathname.includes('/payments/public/') &&
        (u.port === '3000' || u.port === '')
      ) {
        const wrongHost = u.port === '3000' || u.hostname === 'localhost';
        if (wrongHost && !this.config.get('PAYMENT_SMS_LINK_BASE')?.trim()) {
          u.port = '3333';
        }
      }
      return u.toString().replace(/\/$/, '');
    } catch {
      return url;
    }
  }

  private assertSmsLinkReachable(url: string): void {
    const local =
      /localhost|127\.0\.0\.1|10\.0\.2\.2|0\.0\.0\.0/i.test(url);
    if (local && !this.allowLocalhostPaymentLinks()) {
      throw new BadRequestException(
        'Payment link would use localhost — customers cannot open it. Set PAYMENT_SMS_LINK_BASE or PUBLIC_API_BASE_URL to your public HTTPS API (e.g. ngrok tunnel to port 3333).',
      );
    }
  }

  /** Short link in SMS; redirects to BML when configured. */
  customerOpenUrl(reference: string): string {
    const raw = `${this.customerLinkBase()}/payments/public/${encodeURIComponent(reference)}/open`;
    return this.normalizeSmsPaymentUrl(raw);
  }

  private isMerchantReturnUrl(url: string | null | undefined): boolean {
    if (!url?.trim()) return false;
    return /\/payments\/return|wallet\/payment\/return/i.test(url);
  }

  private isBmlHostedPayUrl(url: string | null | undefined): boolean {
    if (!url?.trim()) return false;
    return /pay\.bml\.com\.mv|transaction\.merchants\.bankofmaldives\.com\.mv/i.test(
      url,
    );
  }

  /** Customer checkout (Ticketify UI) before redirect to BML — no coupon/referral. */
  customerCheckoutPageUrl(reference: string): string {
    const review = this.config.get<string>('CUSTOMER_REVIEW_BASE_URL')?.trim();
    if (review) {
      return `${review.replace(/\/$/, '')}/payments/checkout?reference=${encodeURIComponent(reference)}`;
    }
    return `${this.customerLinkBase()}/payments/public/${encodeURIComponent(reference)}/bml`;
  }

  /** Link in SMS: checkout page when admin URL configured, else direct BML pay URL. */
  private smsPaymentUrl(input: {
    reference: string;
    bmlPayUrl: string | null;
    gatewayMode: 'bml' | 'invoice_only';
  }): string {
    if (input.gatewayMode === 'bml' && this.bml.canUseGateway()) {
      if (this.config.get<string>('CUSTOMER_REVIEW_BASE_URL')?.trim()) {
        return this.customerCheckoutPageUrl(input.reference);
      }
      const bmlUrl = input.bmlPayUrl?.trim();
      if (!bmlUrl || !this.isBmlHostedPayUrl(bmlUrl)) {
        throw new BadRequestException(
          'BML did not return a customer payment URL. Check BML credentials.',
        );
      }
      return bmlUrl;
    }
    return this.customerOpenUrl(input.reference);
  }

  async getPublicCheckoutSummary(reference: string) {
    const payment = await this.prisma.ticketPayment.findUnique({
      where: { reference },
      include: { invoice: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    const meta = payment.metadata as { payment_phone?: string } | null;
    const lines = Array.isArray(payment.line_items)
      ? (payment.line_items as Array<{
          label?: string;
          code?: string;
          quantity?: number;
          line_total_mvr?: string | number;
        }>)
      : [];
    return {
      reference: payment.reference,
      status: payment.status,
      invoice_number: payment.invoice?.invoice_number ?? null,
      subtotal_mvr: Number(payment.subtotal_mvr),
      tax_mvr: Number(payment.tax_mvr),
      amount_mvr: Number(payment.amount_mvr),
      currency: payment.currency,
      payment_phone: meta?.payment_phone ?? null,
      line_items: lines,
      can_pay: payment.status === TicketPaymentStatus.PENDING,
      bml_checkout_url: `${this.customerLinkBase()}/payments/public/${encodeURIComponent(reference)}/bml`,
    };
  }

  async resolveBmlHostedRedirect(reference: string): Promise<string> {
    const url = await this.ensureBmlCheckoutUrl(reference);
    if (!url || !this.isBmlHostedPayUrl(url)) {
      throw new BadRequestException(
        'Unable to start Bank of Maldives payment. Ask your technician to resend the link.',
      );
    }
    return url;
  }

  /**
   * Create or refresh BML checkout for a pending payment (SMS + public open link).
   */
  async ensureBmlCheckoutUrl(reference: string): Promise<string | null> {
    if (!this.bml.canUseGateway()) {
      return null;
    }

    const payment = await this.prisma.ticketPayment.findUnique({
      where: { reference },
      include: { invoice: true },
    });
    if (!payment || payment.status !== TicketPaymentStatus.PENDING) {
      return null;
    }

    const meta = payment.metadata as { bml_pay_url?: string } | null;
    if (
      meta?.bml_pay_url &&
      !this.isPublicOpenLink(meta.bml_pay_url) &&
      !this.isMerchantReturnUrl(meta.bml_pay_url) &&
      this.isBmlHostedPayUrl(meta.bml_pay_url)
    ) {
      return meta.bml_pay_url;
    }

    const stored = payment.payment_url?.trim();
    if (
      stored &&
      !this.isPublicOpenLink(stored) &&
      !this.isMerchantReturnUrl(stored) &&
      this.isBmlHostedPayUrl(stored)
    ) {
      return stored;
    }

    if (payment.bml_transaction_id) {
      try {
        const existing = await this.bml.getPaymentTransaction(
          payment.bml_transaction_id,
        );
        const existingUrl = this.bml.pickPayUrl(existing);
        if (existingUrl) {
          await this.persistBmlCheckout(payment.id, existing, existingUrl);
          return existingUrl;
        }
      } catch {
        // fall through to create
      }
    }

    const amountMvr = Number(payment.amount_mvr);
    const invNo = payment.invoice?.invoice_number;
    const customerRef = invNo
      ? `Invoice ${invNo} — ${reference}`
      : `Ticketify payment ${reference}`;

    const bmlTxn = await this.bml.createPaymentTransaction({
      localId: reference,
      amountMvr,
      customerReference: customerRef,
      webhookUrl: this.webhookUrl(),
    });
    const payUrl = this.bml.pickPayUrl(bmlTxn);
    if (!payUrl) {
      return null;
    }
    await this.persistBmlCheckout(payment.id, bmlTxn, payUrl);
    return payUrl;
  }

  private async persistBmlCheckout(
    paymentId: string,
    bmlTxn: {
      id: string | null;
      state: string;
      raw: unknown;
    },
    payUrl: string,
  ) {
    const current = await this.prisma.ticketPayment.findUnique({
      where: { id: paymentId },
      select: { metadata: true },
    });
    await this.prisma.ticketPayment.update({
      where: { id: paymentId },
      data: {
        bml_transaction_id: bmlTxn.id,
        bml_state: bmlTxn.state,
        payment_url: payUrl,
        metadata: {
          ...((current?.metadata as object) ?? {}),
          gateway_mode: 'bml',
          bml_pay_url: payUrl,
          awaiting_payment: true,
          ...(bmlTxn.raw != null ? { bml: bmlTxn.raw as object } : {}),
        },
      },
    });
  }

  private isPublicOpenLink(url: string | null | undefined): boolean {
    if (!url?.trim()) return false;
    return url.includes('/payments/public/') && url.includes('/open');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private buildCustomerPayHtml(payment: {
    reference: string;
    amount_mvr: unknown;
    status: string;
    line_items: unknown;
    invoice?: { invoice_number: string } | null;
  }): string {
    const inv = payment.invoice?.invoice_number ?? payment.reference;
    const total = Number(payment.amount_mvr).toFixed(2);
    const lines = Array.isArray(payment.line_items)
      ? (payment.line_items as Array<{
          label?: string;
          code?: string;
          quantity?: number;
          line_total_mvr?: string | number;
        }>)
      : [];
    const rows = lines
      .map(l => {
        const label = this.escapeHtml(l.label ?? l.code ?? 'Item');
        const qty = l.quantity ?? 1;
        const amt =
          l.line_total_mvr != null
            ? String(l.line_total_mvr)
            : '—';
        return `<tr><td>${label}</td><td>${qty}</td><td style="text-align:right">${this.escapeHtml(amt)} MVR</td></tr>`;
      })
      .join('');
    const status = this.escapeHtml(payment.status);
    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Medianet payment — ${this.escapeHtml(inv)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f4f6f8;color:#1a1a1a}
  .wrap{max-width:480px;margin:0 auto;padding:24px 16px}
  .card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  h1{font-size:1.25rem;margin:0 0 4px}
  .tag{color:#c62828;font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
  table{width:100%;border-collapse:collapse;margin:16px 0;font-size:.9rem}
  td{padding:8px 0;border-bottom:1px solid #eee}
  .total{font-size:1.15rem;font-weight:700;margin-top:12px}
  .muted{color:#666;font-size:.85rem;line-height:1.45}
</style></head><body><div class="wrap"><div class="card">
<p class="tag">Awaiting payment</p>
<h1>Invoice ${this.escapeHtml(inv)}</h1>
<p class="muted">Reference ${this.escapeHtml(payment.reference)} · Status ${status}</p>
<table><tbody>${rows || '<tr><td colspan="3">Charge details on your SMS</td></tr>'}</tbody></table>
<p class="total">Total due: ${total} MVR</p>
<p class="muted">Complete payment via the secure Bank of Maldives link sent to your mobile. If the link expired, ask your technician to resend it from Ticketify.</p>
</div></div></body></html>`;
  }

  async resolveCustomerPaymentOpen(
    reference: string,
  ): Promise<{ kind: 'redirect'; url: string } | { kind: 'html'; html: string }> {
    const payment = await this.prisma.ticketPayment.findUnique({
      where: { reference },
      include: { invoice: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (
      payment.status === TicketPaymentStatus.PENDING &&
      this.bml.canUseGateway()
    ) {
      if (this.config.get<string>('CUSTOMER_REVIEW_BASE_URL')?.trim()) {
        return {
          kind: 'redirect',
          url: this.customerCheckoutPageUrl(reference),
        };
      }
      const bmlCheckout = await this.ensureBmlCheckoutUrl(reference);
      if (bmlCheckout && this.isBmlHostedPayUrl(bmlCheckout)) {
        return { kind: 'redirect', url: bmlCheckout };
      }
    }

    const meta = payment.metadata as {
      bml_pay_url?: string;
      bml?: { url?: string; shortUrl?: string };
    } | null;
    const fromMeta =
      meta?.bml_pay_url ||
      meta?.bml?.shortUrl ||
      meta?.bml?.url ||
      null;
    if (
      fromMeta &&
      !this.isPublicOpenLink(fromMeta) &&
      !this.isMerchantReturnUrl(fromMeta) &&
      this.isBmlHostedPayUrl(fromMeta)
    ) {
      return { kind: 'redirect', url: fromMeta };
    }

    const direct = payment.payment_url?.trim();
    if (
      direct &&
      !this.isPublicOpenLink(direct) &&
      !this.isMerchantReturnUrl(direct) &&
      this.isBmlHostedPayUrl(direct)
    ) {
      return { kind: 'redirect', url: direct };
    }

    return { kind: 'html', html: this.buildCustomerPayHtml(payment) };
  }

  private webhookUrl(): string | undefined {
    const configured = this.config.get<string>('BML_WEBHOOK_URL');
    if (configured?.trim()) return configured.trim();
    const publicBase = this.config.get<string>('PUBLIC_API_BASE_URL');
    if (publicBase?.trim()) {
      return `${publicBase.replace(/\/$/, '')}/api/v1/payments/webhooks/bml`;
    }
    return undefined;
  }

  async listForTicket(crmTicketId: string) {
    return this.prisma.ticketPayment.findMany({
      where: { crm_ticket_id: crmTicketId },
      orderBy: { created_at: 'desc' },
      include: { receipt: true, invoice: true },
    });
  }

  private defaultPhoneFromSr(srData: {
    contact?: { phone?: { number?: string } };
  }): string | null {
    const n = srData?.contact?.phone?.number;
    return n?.trim() ? n.trim() : null;
  }

  private resolvePaymentPhone(
    srData: { contact?: { phone?: { number?: string } } },
    dto: CreateTicketPaymentDto,
  ): string {
    const defaultPhone = this.defaultPhoneFromSr(srData);
    const requested = dto.payment_phone?.trim();
    if (!requested) {
      if (!defaultPhone) {
        throw new BadRequestException(
          'Customer mobile number not found in CRM',
        );
      }
      return defaultPhone;
    }
    if (defaultPhone && requested !== defaultPhone && !dto.phone_override_confirmed) {
      throw new BadRequestException(
        'Confirm override when using a different payment mobile number',
      );
    }
    return requested;
  }

  private lineItemsFromDto(dto: CreateTicketPaymentDto): ChargeLineInput[] {
    if (dto.items?.length) {
      return dto.items.map(i => ({ code: i.code, quantity: i.quantity }));
    }
    if (dto.charge_codes?.length) {
      return dto.charge_codes.map(code => ({ code, quantity: 1 }));
    }
    return [];
  }

  private async postCrmChargeNote(crmTicketId: string, note: string) {
    const base = this.config.get<string>('CRM_BACKOFFICE_API_URL') ?? '';
    try {
      await fetch(`${base.replace(/\/$/, '')}/service_requests/${crmTicketId}/notes`, {
        method: 'POST',
        headers: {
          api_key: this.config.get('CRM_API_KEY') ?? '',
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note, pinned: false }),
      });
    } catch {
      // CRM note is best-effort; invoice remains in Ticketify
    }
  }

  private async sendPaymentSms(input: {
    phone: string;
    srNumber: string;
    invoiceNumber: string;
    itemsText: string;
    totalMvr: number;
    paymentUrl: string;
  }) {
    const fromTemplate = await this.templates.render('PAYMENT_REQUEST', {
      SR_ID: input.srNumber,
      INV_NO: input.invoiceNumber,
      ITEMS: input.itemsText,
      TOTAL: input.totalMvr.toFixed(2),
      LINK: input.paymentUrl,
    });

    const message =
      fromTemplate ??
      `Medianet: Invoice ${input.invoiceNumber} for SR ${input.srNumber}. Charges: ${input.itemsText}. Total MVR ${input.totalMvr.toFixed(2)}. Pay: ${input.paymentUrl}`;

    await this.sms.publishSMS({ phone: input.phone, message });
  }

  async initiateForTicket(
    crmTicketId: string,
    dto: CreateTicketPaymentDto,
    createdByUserId?: string,
  ) {
    const sr = await this.crm.getServiceRequest(crmTicketId);
    if (!sr.ok) {
      throw new NotFoundException('CRM service request not found');
    }
    const srData = sr.data as {
      number?: string;
      contact?: { phone?: { number?: string } };
    };

    if (dto.resend_sms) {
      return this.resendPendingPaymentSms(crmTicketId, dto, createdByUserId, srData);
    }

    if (!this.bml.canUseGateway() && !this.bml.allowInvoiceWithoutGateway()) {
      throw new BadRequestException(
        'BML is not configured. Set BML_ENABLED=true with BML_AUTH_TOKEN, BML_API_KEY, and BML_REDIRECT_URL, or use development mode for invoice + SMS without live BML.',
      );
    }

    if (createdByUserId) {
      await this.billing.markChargeableAfterPaymentInit(
        crmTicketId,
        createdByUserId,
      );
    }

    const lineInputs = this.lineItemsFromDto(dto);
    const invoice = dto.invoice_id
      ? await this.invoices.getById(dto.invoice_id)
      : await this.invoices.createFromLineItems(
          crmTicketId,
          lineInputs,
          createdByUserId,
          true,
        );

    if (invoice.crm_ticket_id !== crmTicketId) {
      throw new BadRequestException('Invoice does not belong to this ticket');
    }
    if (invoice.status === 'PAID') {
      throw new BadRequestException('Invoice is already paid');
    }
    if (invoice.status === 'VOID') {
      throw new BadRequestException('Invoice is void');
    }

    const amountMvr = Number(invoice.total_mvr);
    const lineItems = invoice.line_items;
    const reference = this.buildReference();
    const customerRef =
      dto.customer_reference ??
      `Invoice ${invoice.invoice_number} — SR ${srData?.number ?? crmTicketId}`;

    const paymentPhone = this.resolvePaymentPhone(srData, dto);

    const payment = await this.prisma.ticketPayment.create({
      data: {
        reference,
        crm_ticket_id: crmTicketId,
        invoice_id: invoice.id,
        amount_mvr: amountMvr,
        subtotal_mvr: invoice.subtotal_mvr,
        tax_mvr: invoice.tax_mvr,
        currency: 'MVR',
        status: TicketPaymentStatus.PENDING,
        line_items: lineItems as object,
        created_by_user_id: createdByUserId,
        metadata: {
          payment_phone: paymentPhone,
          awaiting_payment: true,
        },
      },
    });

    const smsLink = this.customerOpenUrl(reference);
    let bmlTxn: Awaited<
      ReturnType<BmlPaymentService['createPaymentTransaction']>
    > | null = null;
    let paymentUrl: string;
    let gatewayMode: 'bml' | 'invoice_only' = 'bml';

    if (this.bml.canUseGateway()) {
      try {
        bmlTxn = await this.bml.createPaymentTransaction({
          localId: reference,
          amountMvr,
          customerReference: customerRef,
          webhookUrl: this.webhookUrl(),
        });
      } catch (err) {
        await this.prisma.ticketPayment.update({
          where: { id: payment.id },
          data: {
            status: TicketPaymentStatus.FAILED,
            metadata: { error: String(err), payment_phone: paymentPhone },
          },
        });
        throw err;
      }
      const bmlDirect = this.bml.pickPayUrl(bmlTxn);
      if (!bmlDirect) {
        throw new BadRequestException('BML did not return a payment URL');
      }
      paymentUrl = bmlDirect;
    } else {
      gatewayMode = 'invoice_only';
      paymentUrl = '';
    }

    const resolved = await this.chargeCatalog.resolveLines(lineInputs);
    const itemsText = this.chargeCatalog.formatLinesForSms(resolved.lines);

    const bmlPayUrl = bmlTxn ? this.bml.pickPayUrl(bmlTxn) : null;
    const linkForSms = this.normalizeSmsPaymentUrl(
      this.smsPaymentUrl({
        reference,
        bmlPayUrl,
        gatewayMode,
      }),
    );
    if (gatewayMode !== 'bml') {
      this.assertSmsLinkReachable(linkForSms);
    }

    await this.sendPaymentSms({
      phone: paymentPhone,
      srNumber: srData?.number ?? crmTicketId,
      invoiceNumber: invoice.invoice_number,
      itemsText,
      totalMvr: amountMvr,
      paymentUrl: linkForSms,
    });

    await this.prisma.ticketPayment.update({
      where: { id: payment.id },
      data: {
        bml_transaction_id: bmlTxn?.id ?? null,
        bml_state: bmlTxn?.state ?? 'PENDING',
        payment_url: paymentUrl || null,
        metadata: {
          payment_phone: paymentPhone,
          awaiting_payment: true,
          gateway_mode: gatewayMode,
          sms_link: linkForSms,
          ...(gatewayMode === 'bml' && bmlPayUrl ? {bml_pay_url: bmlPayUrl} : {}),
          ...(bmlTxn?.raw != null ? {bml: bmlTxn.raw as object} : {}),
        },
      },
    });

    const crmNote = [
      'Ticketify charge — awaiting payment.',
      `Items: ${itemsText}.`,
      `Invoice ${invoice.invoice_number}. Total MVR ${amountMvr.toFixed(2)} (incl. tax).`,
      `Payment link sent to ${paymentPhone}. Status: AWAITING_PAYMENT.`,
    ].join(' ');

    void this.postCrmChargeNote(crmTicketId, crmNote);

    void this.audit.log({
      entity_type: 'ticket_payment',
      entity_id: payment.id,
      action:
        gatewayMode === 'bml'
          ? 'BML_PAYMENT_INITIATED'
          : 'INVOICE_PAYMENT_SMS_SENT',
      actor_user_id: createdByUserId,
      new_state: {
        reference,
        invoice_number: invoice.invoice_number,
        payment_phone: paymentPhone,
        phone_override: paymentPhone !== this.defaultPhoneFromSr(srData),
        items: itemsText,
        payment_url: paymentUrl || null,
      },
      crm_sync_ok: true,
    }).catch(() => undefined);

    const linkReachable =
      !/localhost|127\.0\.0\.1|10\.0\.2\.2/i.test(linkForSms);

    return {
      reference,
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      crm_ticket_id: crmTicketId,
      subtotal_mvr: Number(invoice.subtotal_mvr),
      tax_mvr: Number(invoice.tax_mvr),
      amount_mvr: amountMvr,
      gst_rate: Number(invoice.gst_rate),
      currency: 'MVR',
      status: TicketPaymentStatus.PENDING,
      awaiting_payment: true,
      payment_url: paymentUrl,
      qr_image_url: bmlTxn?.qrImageUrl ?? null,
      bml_transaction_id: bmlTxn?.id ?? null,
      gateway_mode: gatewayMode,
      sms_link: linkForSms,
      sms_sent: true,
      customer_link_reachable_from_mobile: linkReachable,
      ...(linkReachable
        ? {}
        : {
            link_hint:
              'This link only works on your PC. For customer phones set PAYMENT_SMS_LINK_BASE to a public HTTPS URL (ngrok → port 3333), or enable BML for bank-hosted pay links.',
          }),
      line_items: lineItems,
      payment_phone: paymentPhone,
    };
  }

  private async resendPendingPaymentSms(
    crmTicketId: string,
    dto: CreateTicketPaymentDto,
    createdByUserId: string | undefined,
    srData: { number?: string; contact?: { phone?: { number?: string } } },
  ) {
    const pending = await this.prisma.ticketPayment.findFirst({
      where: {
        crm_ticket_id: crmTicketId,
        status: TicketPaymentStatus.PENDING,
      },
      orderBy: { created_at: 'desc' },
      include: { invoice: true },
    });
    if (!pending) {
      throw new BadRequestException('No pending payment to resend');
    }
    const metaPending = pending.metadata as { sms_link?: string } | null;
    if (!pending.payment_url && !metaPending?.sms_link) {
      throw new BadRequestException('No pending payment link to resend');
    }

    let bmlPayUrl: string | null = null;
    if (this.bml.canUseGateway()) {
      bmlPayUrl = await this.ensureBmlCheckoutUrl(pending.reference);
    }

    const paymentPhone = this.resolvePaymentPhone(srData, dto);
    const lineItems = pending.line_items as any[];
    const resolved = await this.chargeCatalog.resolveLines(
      lineItems.map(l => ({ code: l.code, quantity: l.quantity ?? 1 })),
    );
    const itemsText = this.chargeCatalog.formatLinesForSms(resolved.lines);

    const meta = pending.metadata as {
      sms_link?: string;
      gateway_mode?: 'bml' | 'invoice_only';
      bml_pay_url?: string;
    } | null;
    const gatewayMode =
      bmlPayUrl || meta?.bml_pay_url
        ? 'bml'
        : (meta?.gateway_mode ?? 'invoice_only');
    const resolvedBmlPay =
      (bmlPayUrl && this.isBmlHostedPayUrl(bmlPayUrl) ? bmlPayUrl : null) ||
      (meta?.bml_pay_url && this.isBmlHostedPayUrl(meta.bml_pay_url)
        ? meta.bml_pay_url
        : null);
    const linkForSms = this.normalizeSmsPaymentUrl(
      this.smsPaymentUrl({
        reference: pending.reference,
        bmlPayUrl: resolvedBmlPay,
        gatewayMode,
      }),
    );
    if (gatewayMode !== 'bml') {
      this.assertSmsLinkReachable(linkForSms);
    }

    await this.sendPaymentSms({
      phone: paymentPhone,
      srNumber: srData?.number ?? crmTicketId,
      invoiceNumber: pending.invoice?.invoice_number ?? pending.reference,
      itemsText,
      totalMvr: Number(pending.amount_mvr),
      paymentUrl: linkForSms,
    });

    void this.audit.log({
      entity_type: 'ticket_payment',
      entity_id: pending.id,
      action: 'BML_PAYMENT_SMS_RESENT',
      actor_user_id: createdByUserId,
      new_state: { payment_phone: paymentPhone, reference: pending.reference },
      crm_sync_ok: true,
    });

    return {
      reference: pending.reference,
      payment_url: pending.payment_url,
      sms_sent: true,
      resent: true,
    };
  }

  async getByReference(reference: string) {
    const payment = await this.prisma.ticketPayment.findUnique({
      where: { reference },
      include: { invoice: true, receipt: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }

  async reconcile(reference: string, actorUserId?: string) {
    const payment = await this.getByReference(reference);
    if (payment.status === TicketPaymentStatus.CONFIRMED) {
      return { ...payment, already_confirmed: true };
    }

    let bmlId = payment.bml_transaction_id;
    if (!bmlId) {
      await this.ensureBmlCheckoutUrl(reference);
      const refreshed = await this.getByReference(reference);
      bmlId = refreshed.bml_transaction_id;
    }
    if (!bmlId) {
      return {
        ...payment,
        pending: true,
        message: 'Payment not initiated at BML',
      };
    }

    return this.syncFromBml(bmlId, reference, actorUserId);
  }

  async processWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
    const headerVerified = this.bml.verifyWebhookHeaders(headers);
    const legacyVerified =
      nodeEnv === 'production'
        ? false
        : this.bml.verifyLegacyWebhookPayload(payload);

    if (!headerVerified && !legacyVerified) {
      throw new ForbiddenException('Invalid BML webhook signature');
    }

    const transactionId =
      (payload.transactionId as string) ||
      (payload.id as string) ||
      ((payload.transaction as { id?: string })?.id ?? null);
    const localId =
      (payload.localId as string) ||
      (payload.local_id as string) ||
      ((payload.transaction as { localId?: string })?.localId ?? null);

    if (transactionId) {
      return this.syncFromBml(transactionId, localId ?? undefined);
    }

    if (localId) {
      const payment = await this.prisma.ticketPayment.findUnique({
        where: { reference: localId },
      });
      if (!payment?.bml_transaction_id) {
        return { handled: false, reason: 'payment_not_found' };
      }
      return this.syncFromBml(payment.bml_transaction_id, localId);
    }

    return { handled: false, reason: 'missing_identifiers' };
  }

  private async syncFromBml(
    bmlTransactionId: string,
    localId?: string,
    actorUserId?: string,
  ) {
    const bmlTxn = await this.bml.getPaymentTransaction(bmlTransactionId);
    const payment = localId
      ? await this.prisma.ticketPayment.findUnique({ where: { reference: localId } })
      : await this.prisma.ticketPayment.findFirst({
          where: { bml_transaction_id: bmlTransactionId },
        });

    if (!payment) {
      return { handled: false, reason: 'payment_not_found', bml_state: bmlTxn.state };
    }

    if (payment.status === TicketPaymentStatus.CONFIRMED) {
      return { handled: true, reference: payment.reference, status: payment.status };
    }

    const expectedMinor = this.bml.toMinorUnits(Number(payment.amount_mvr));
    const bmlMinor = Math.round(Number(bmlTxn.amount));
    if (
      Number.isFinite(bmlMinor) &&
      bmlMinor > 0 &&
      bmlMinor !== expectedMinor
    ) {
      throw new BadRequestException('BML amount does not match pending payment');
    }

    if (bmlTxn.localId && bmlTxn.localId !== payment.reference) {
      throw new BadRequestException('BML localId does not match payment reference');
    }

    let status: TicketPaymentStatus = payment.status;
    if (this.bml.isPaymentConfirmed(bmlTxn.state)) {
      status = TicketPaymentStatus.CONFIRMED;
    } else if (this.bml.isPaymentFailed(bmlTxn.state)) {
      status = TicketPaymentStatus.FAILED;
    }

    const updated = await this.prisma.ticketPayment.update({
      where: { id: payment.id },
      data: {
        status,
        bml_state: bmlTxn.state,
        bml_transaction_id: bmlTxn.id ?? payment.bml_transaction_id,
        confirmed_at:
          status === TicketPaymentStatus.CONFIRMED ? new Date() : null,
        payment_url: bmlTxn.shortUrl || bmlTxn.url || payment.payment_url,
        metadata: {
          ...(payment.metadata as object),
          awaiting_payment: status === TicketPaymentStatus.PENDING,
        },
      },
    });

    if (status === TicketPaymentStatus.CONFIRMED) {
      let receipt = null;
      let invoiceNumber = payment.reference;
      if (payment.invoice_id) {
        const invoice = await this.invoices.markPaid(payment.invoice_id);
        invoiceNumber = invoice.invoice_number;
        receipt = await this.receipts.issueForPayment(invoice, updated);
      }

      const confirmNote = `Customer charged (Ticketify). Invoice ${invoiceNumber}. Total MVR ${Number(payment.amount_mvr).toFixed(2)}. Payment confirmed. Ref: ${payment.reference}.`;
      await this.postCrmChargeNote(payment.crm_ticket_id, confirmNote);

      await this.audit.log({
        entity_type: 'ticket_payment',
        entity_id: payment.id,
        action: 'BML_PAYMENT_CONFIRMED',
        actor_user_id: actorUserId,
        new_state: {
          reference: payment.reference,
          bml_transaction_id: bmlTxn.id,
          amount_mvr: payment.amount_mvr,
          receipt_number: receipt?.receipt_number,
        },
        crm_sync_ok: true,
        idempotency_key: `bml-confirmed:${payment.reference}`,
      });

      return {
        handled: true,
        ...updated,
        bml_state: bmlTxn.state,
        receipt,
        payment_status: 'confirmed',
      };
    }

    return { handled: true, ...updated, bml_state: bmlTxn.state };
  }
}
