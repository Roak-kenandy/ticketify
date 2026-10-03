import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  TicketInvoiceStatus,
  TicketPaymentStatus,
} from '@prisma/client';
import type { TicketPayment } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';
import { TicketInvoiceService } from 'src/finance/ticket-invoice.service';
import { TicketReceiptService } from 'src/finance/ticket-receipt.service';
import { TicketBillingService } from 'src/finance/ticket-billing.service';
import {
  BmlPaymentService,
  BmlTransactionView,
  StoredBmlTransaction,
} from './bml-payment.service';
import {
  ChargeCatalogService,
  ChargeLineInput,
} from 'src/charges/charge-catalog.service';
import SMSService from 'src/shared/ooredoo-sms/sms.service';
import { NotificationTemplateService } from 'src/notifications/notification-template.service';
import { CreateTicketPaymentDto } from './dto/create-ticket-payment.dto';
import { PushNotifierService } from 'src/shared/one-signal/notification/push-notifier.service';

type PaymentMetadata = {
  payment_phone?: string;
  awaiting_payment?: boolean;
  gateway_mode?: 'bml' | 'invoice_only';
  sms_link?: string;
  bml_pay_url?: string;
  bml?: StoredBmlTransaction | Record<string, unknown>;
  superseded_by?: string;
  review_required?: boolean;
  review_reason?: string;
  last_bml_check_at?: string;
  error?: string;
};

export type SyncSource =
  | 'webhook'
  | 'return_page'
  | 'reconciler'
  | 'staff'
  | 'supersede';

export type PublicPaymentStatus = {
  reference: string;
  status: TicketPaymentStatus;
  paid: boolean;
  final: boolean;
  invoice_number: string | null;
  receipt_number: string | null;
  amount_mvr: number;
  currency: string;
  confirmed_at: Date | null;
};

const PUBLIC_VERIFY_COOLDOWN_MS = 4000;

@Injectable()
export class TicketPaymentService {
  private readonly logger = new Logger(TicketPaymentService.name);
  private readonly publicVerifyCache = new Map<
    string,
    { at: number; result: Promise<PublicPaymentStatus> }
  >();

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
    private push: PushNotifierService,
  ) {}

  /** Unguessable: the reference is the only key protecting the public pay pages. */
  private buildReference(): string {
    const random = crypto.randomBytes(9).toString('base64url');
    return `TKT-PAY-${Date.now().toString(36).toUpperCase()}-${random}`;
  }

  private meta(payment: { metadata: unknown }): PaymentMetadata {
    return (payment.metadata as PaymentMetadata | null) ?? {};
  }

  private maskPhone(phone: string | null | undefined): string | null {
    const digits = String(phone ?? '').trim();
    if (!digits) return null;
    if (digits.length <= 4) return '••••';
    return `${digits.slice(0, 3)}${'•'.repeat(Math.max(2, digits.length - 5))}${digits.slice(-2)}`;
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

  private isLocalUrl(url: string): boolean {
    return /localhost|127\.0\.0\.1|10\.0\.2\.2|0\.0\.0\.0/i.test(url);
  }

  private assertSmsLinkReachable(url: string): void {
    if (this.isLocalUrl(url) && !this.allowLocalhostPaymentLinks()) {
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

  private isBmlHostedPayUrl(url: string | null | undefined): boolean {
    if (!url?.trim()) return false;
    try {
      const host = new URL(url).hostname.toLowerCase();
      return (
        host === 'pay.bml.com.mv' ||
        host.endsWith('.pay.bml.com.mv') ||
        host === 'transaction.merchants.bankofmaldives.com.mv'
      );
    } catch {
      return false;
    }
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

  private webhookUrl(): string | undefined {
    const configured = this.config.get<string>('BML_WEBHOOK_URL');
    if (configured?.trim()) return configured.trim();
    const publicBase = this.config.get<string>('PUBLIC_API_BASE_URL');
    if (publicBase?.trim()) {
      const base = publicBase.trim().replace(/\/$/, '');
      return base.endsWith('/api/v1')
        ? `${base}/payments/webhooks/bml`
        : `${base}/api/v1/payments/webhooks/bml`;
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Public (customer) endpoints — keyed only by the unguessable reference.
  // ---------------------------------------------------------------------------

  async getPublicCheckoutSummary(reference: string) {
    const payment = await this.prisma.ticketPayment.findUnique({
      where: { reference },
      include: { invoice: true, receipt: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    const meta = this.meta(payment);
    const lines = Array.isArray(payment.line_items)
      ? (
          payment.line_items as Array<{
            label?: string;
            code?: string;
            quantity?: number;
            line_total_mvr?: string | number;
          }>
        ).map((l) => ({
          label: l.label,
          code: l.code,
          quantity: l.quantity,
          line_total_mvr: l.line_total_mvr,
        }))
      : [];
    return {
      reference: payment.reference,
      status: payment.status,
      paid: payment.status === TicketPaymentStatus.CONFIRMED,
      invoice_number: payment.invoice?.invoice_number ?? null,
      receipt_number: payment.receipt?.receipt_number ?? null,
      subtotal_mvr: Number(payment.subtotal_mvr ?? 0),
      tax_mvr: Number(payment.tax_mvr ?? 0),
      amount_mvr: Number(payment.amount_mvr),
      currency: payment.currency,
      payment_phone: this.maskPhone(meta.payment_phone),
      line_items: lines,
      can_pay: payment.status === TicketPaymentStatus.PENDING,
      bml_checkout_url: `${this.customerLinkBase()}/payments/public/${encodeURIComponent(reference)}/bml`,
    };
  }

  /**
   * Called by the return page after BML redirects the customer back. Never trusts
   * the redirect's query string: always re-reads the transaction from BML.
   * Concurrent/rapid polls for the same reference share one gateway call.
   */
  verifyPublic(reference: string): Promise<PublicPaymentStatus> {
    const now = Date.now();
    const cached = this.publicVerifyCache.get(reference);
    if (cached && now - cached.at < PUBLIC_VERIFY_COOLDOWN_MS) {
      return cached.result;
    }
    if (this.publicVerifyCache.size > 5000) {
      this.publicVerifyCache.clear();
    }
    const result = this.verifyPublicUncached(reference);
    this.publicVerifyCache.set(reference, { at: now, result });
    result.catch(() => this.publicVerifyCache.delete(reference));
    return result;
  }

  private async verifyPublicUncached(
    reference: string,
  ): Promise<PublicPaymentStatus> {
    const payment = await this.prisma.ticketPayment.findUnique({
      where: { reference },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (
      payment.status !== TicketPaymentStatus.CONFIRMED &&
      payment.bml_transaction_id &&
      this.bml.canUseGateway()
    ) {
      try {
        await this.syncPayment(payment.id, 'return_page');
      } catch (err) {
        // The customer still sees the last known status; the reconciler retries.
        this.logger.warn(
          `Return-page verify failed for ${reference}: ${(err as Error).message}`,
        );
      }
    }
    return this.publicStatus(reference);
  }

  private async publicStatus(reference: string): Promise<PublicPaymentStatus> {
    const payment = await this.prisma.ticketPayment.findUnique({
      where: { reference },
      include: { invoice: true, receipt: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    const paid = payment.status === TicketPaymentStatus.CONFIRMED;
    return {
      reference: payment.reference,
      status: payment.status,
      paid,
      final: payment.status !== TicketPaymentStatus.PENDING,
      invoice_number: payment.invoice?.invoice_number ?? null,
      receipt_number: payment.receipt?.receipt_number ?? null,
      amount_mvr: Number(payment.amount_mvr),
      currency: payment.currency,
      confirmed_at: payment.confirmed_at,
    };
  }

  async resolveBmlHostedRedirect(reference: string): Promise<string> {
    const url = await this.ensureBmlCheckoutUrl(reference);
    if (!url || !this.isBmlHostedPayUrl(url)) {
      throw new BadRequestException(
        'This payment link is no longer active. Ask your technician to resend it.',
      );
    }
    return url;
  }

  /**
   * Returns a payable BML URL for a pending payment. Reuses the existing BML
   * transaction while it is still payable; only opens a new one when BML says the
   * old one is closed. A gateway outage throws instead of creating a duplicate.
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

    if (payment.bml_transaction_id) {
      const existing = await this.bml.getPaymentTransaction(
        payment.bml_transaction_id,
      );
      if (this.bml.isPaymentConfirmed(existing.state)) {
        await this.applyBmlTransaction(payment, existing, 'return_page');
        return null;
      }
      if (!this.bml.isTerminalFailure(existing)) {
        const url = this.bml.pickPayUrl(existing) ?? payment.payment_url;
        if (url && this.isBmlHostedPayUrl(url)) {
          await this.persistBmlCheckout(payment.id, existing, url);
          return url;
        }
      }
    }

    const invNo = payment.invoice?.invoice_number;
    const bmlTxn = await this.bml.createPaymentTransaction({
      localId: reference,
      amountMvr: Number(payment.amount_mvr),
      customerReference: invNo
        ? `Invoice ${invNo} — ${reference}`
        : `Ticketify payment ${reference}`,
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
    bmlTxn: BmlTransactionView,
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
          ...this.meta({ metadata: current?.metadata }),
          gateway_mode: 'bml',
          bml_pay_url: payUrl,
          awaiting_payment: true,
          bml: this.bml.toStored(bmlTxn),
        } as Prisma.InputJsonValue,
      },
    });
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
    const paid = payment.status === TicketPaymentStatus.CONFIRMED;
    const lines = Array.isArray(payment.line_items)
      ? (payment.line_items as Array<{
          label?: string;
          code?: string;
          quantity?: number;
          line_total_mvr?: string | number;
        }>)
      : [];
    const rows = lines
      .map((l) => {
        const label = this.escapeHtml(String(l.label ?? l.code ?? 'Item'));
        const qty = this.escapeHtml(String(l.quantity ?? 1));
        const amt = l.line_total_mvr != null ? String(l.line_total_mvr) : '—';
        return `<tr><td>${label}</td><td>${qty}</td><td style="text-align:right">${this.escapeHtml(amt)} MVR</td></tr>`;
      })
      .join('');
    const tag = paid ? 'Paid' : 'Awaiting payment';
    const note = paid
      ? 'This invoice has been paid. Thank you.'
      : 'Complete payment via the secure Bank of Maldives link sent to your mobile. If the link expired, ask your technician to resend it from Ticketify.';
    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>Medianet payment — ${this.escapeHtml(inv)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f4f6f8;color:#1a1a1a}
  .wrap{max-width:480px;margin:0 auto;padding:24px 16px}
  .card{background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  h1{font-size:1.25rem;margin:0 0 4px}
  .tag{color:${paid ? '#2e7d32' : '#c62828'};font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
  table{width:100%;border-collapse:collapse;margin:16px 0;font-size:.9rem}
  td{padding:8px 0;border-bottom:1px solid #eee}
  .total{font-size:1.15rem;font-weight:700;margin-top:12px}
  .muted{color:#666;font-size:.85rem;line-height:1.45}
</style></head><body><div class="wrap"><div class="card">
<p class="tag">${tag}</p>
<h1>Invoice ${this.escapeHtml(inv)}</h1>
<p class="muted">Reference ${this.escapeHtml(payment.reference)}</p>
<table><tbody>${rows || '<tr><td colspan="3">Charge details on your SMS</td></tr>'}</tbody></table>
<p class="total">${paid ? 'Total paid' : 'Total due'}: ${total} MVR</p>
<p class="muted">${note}</p>
</div></div></body></html>`;
  }

  async resolveCustomerPaymentOpen(
    reference: string,
  ): Promise<
    { kind: 'redirect'; url: string } | { kind: 'html'; html: string }
  > {
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
      const refreshed = await this.prisma.ticketPayment.findUnique({
        where: { reference },
        include: { invoice: true },
      });
      return {
        kind: 'html',
        html: this.buildCustomerPayHtml(refreshed ?? payment),
      };
    }

    return { kind: 'html', html: this.buildCustomerPayHtml(payment) };
  }

  // ---------------------------------------------------------------------------
  // Staff endpoints
  // ---------------------------------------------------------------------------

  /** Strips gateway payloads before payment rows leave the API. */
  private toStaffView<T extends { metadata: unknown }>(payment: T): T {
    const meta = { ...this.meta(payment) };
    if (meta.bml && !('checked_at' in meta.bml)) {
      delete meta.bml;
    }
    return { ...payment, metadata: meta };
  }

  async listForTicket(crmTicketId: string) {
    const rows = await this.prisma.ticketPayment.findMany({
      where: { crm_ticket_id: crmTicketId },
      orderBy: { created_at: 'desc' },
      include: { receipt: true, invoice: true },
    });
    return rows.map((row) => this.toStaffView(row));
  }

  async getByReference(reference: string) {
    const payment = await this.prisma.ticketPayment.findUnique({
      where: { reference },
      include: { invoice: true, receipt: true },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return this.toStaffView(payment);
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
    if (
      defaultPhone &&
      requested !== defaultPhone &&
      !dto.phone_override_confirmed
    ) {
      throw new BadRequestException(
        'Confirm override when using a different payment mobile number',
      );
    }
    return requested;
  }

  private lineItemsFromDto(dto: CreateTicketPaymentDto): ChargeLineInput[] {
    if (dto.items?.length) {
      return dto.items.map((i) => ({ code: i.code, quantity: i.quantity }));
    }
    if (dto.charge_codes?.length) {
      return dto.charge_codes.map((code) => ({ code, quantity: 1 }));
    }
    return [];
  }

  /** Resolves true only when the CRM accepted the note. */
  private async postCrmChargeNote(
    crmTicketId: string,
    note: string,
  ): Promise<boolean> {
    const base = this.config.get<string>('CRM_BACKOFFICE_API_URL') ?? '';
    if (!base) return false;
    try {
      const res = await fetch(
        `${base.replace(/\/$/, '')}/service_requests/${encodeURIComponent(crmTicketId)}/notes`,
        {
          method: 'POST',
          headers: {
            api_key: this.config.get('CRM_API_KEY') ?? '',
            accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ note, pinned: false }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) {
        this.logger.warn(
          `CRM note for ${crmTicketId} rejected (${res.status})`,
        );
      }
      return res.ok;
    } catch (err) {
      this.logger.warn(
        `CRM note for ${crmTicketId} failed: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private formatMvr(value: unknown): string {
    return `MVR ${Number(value ?? 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  private buildPaymentReceivedNote(payment: {
    reference: string;
    amount_mvr: unknown;
    subtotal_mvr: unknown;
    tax_mvr: unknown;
    line_items: unknown;
    confirmed_at: Date | null;
    invoice?: { invoice_number: string } | null;
    receipt?: { receipt_number: string } | null;
  }): string {
    const lines = Array.isArray(payment.line_items)
      ? (payment.line_items as Array<{
          label?: string;
          code?: string;
          quantity?: number;
          line_total_mvr?: string | number;
        }>)
      : [];
    const items = lines.length
      ? lines
          .map((l) => {
            const name = l.label ?? l.code ?? 'Item';
            const total =
              l.line_total_mvr != null
                ? ` (${this.formatMvr(l.line_total_mvr)})`
                : '';
            return `${name} × ${l.quantity ?? 1}${total}`;
          })
          .join(', ')
      : 'See invoice';
    const paidAt = (payment.confirmed_at ?? new Date()).toLocaleString(
      'en-GB',
      {
        timeZone: 'Indian/Maldives',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      },
    );

    return [
      `Ticketify payment received — customer paid ${this.formatMvr(payment.amount_mvr)} via Bank of Maldives.`,
      `Items: ${items}.`,
      `Subtotal ${this.formatMvr(payment.subtotal_mvr)} + GST ${this.formatMvr(payment.tax_mvr)} = Total ${this.formatMvr(payment.amount_mvr)}.`,
      [
        payment.invoice ? `Invoice ${payment.invoice.invoice_number}` : null,
        payment.receipt ? `Receipt ${payment.receipt.receipt_number}` : null,
        `Paid ${paidAt}`,
        `Ref ${payment.reference}`,
      ]
        .filter(Boolean)
        .join(' · ') + '.',
    ].join(' ');
  }

  /**
   * Posts the "customer paid" note on the CRM ticket once. Marked as posted only
   * after the CRM accepts it, so the reconciler can retry failures.
   */
  async postPaymentReceivedNote(paymentId: string): Promise<boolean> {
    const payment = await this.prisma.ticketPayment.findUnique({
      where: { id: paymentId },
      include: { invoice: true, receipt: true },
    });
    if (!payment || payment.status !== TicketPaymentStatus.CONFIRMED)
      return false;
    if (
      (payment.metadata as { crm_paid_note_at?: string } | null)
        ?.crm_paid_note_at
    ) {
      return true;
    }

    const ok = await this.postCrmChargeNote(
      payment.crm_ticket_id,
      this.buildPaymentReceivedNote(payment),
    );
    if (!ok) return false;

    const fresh = await this.prisma.ticketPayment.findUnique({
      where: { id: paymentId },
      select: { metadata: true },
    });
    await this.prisma.ticketPayment.update({
      where: { id: paymentId },
      data: {
        metadata: {
          ...this.meta({ metadata: fresh?.metadata }),
          crm_paid_note_at: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
    return true;
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

  /**
   * Before a new charge is issued, every open link for the ticket is checked
   * with BML. A paid one blocks the new charge (no double billing); unpaid ones
   * are retired. Retired links stay under reconciler watch until BML expires
   * them, so a late payment on an old link is still recorded.
   */
  private async supersedePendingPayments(
    crmTicketId: string,
    keepInvoiceId: string | undefined,
    actorUserId: string | undefined,
  ) {
    const pending = await this.prisma.ticketPayment.findMany({
      where: {
        crm_ticket_id: crmTicketId,
        status: TicketPaymentStatus.PENDING,
      },
      include: { invoice: true },
    });

    for (const old of pending) {
      if (old.bml_transaction_id && this.bml.canUseGateway()) {
        let synced: TicketPayment | null;
        try {
          synced = await this.syncPayment(old.id, 'supersede', actorUserId);
        } catch {
          throw new ServiceUnavailableException(
            'Could not confirm the earlier payment link with the bank. Try again in a moment.',
          );
        }
        if (synced?.status === TicketPaymentStatus.CONFIRMED) {
          throw new BadRequestException(
            `The customer has already paid invoice ${old.invoice?.invoice_number ?? old.reference}. Refresh billing.`,
          );
        }
      }

      const claimed = await this.prisma.ticketPayment.updateMany({
        where: { id: old.id, status: TicketPaymentStatus.PENDING },
        data: {
          status: TicketPaymentStatus.CANCELLED,
          metadata: {
            ...this.meta(old),
            awaiting_payment: false,
            superseded_at: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      if (claimed.count === 0) continue;

      if (
        old.invoice_id &&
        old.invoice_id !== keepInvoiceId &&
        old.invoice?.status !== TicketInvoiceStatus.PAID
      ) {
        await this.prisma.ticketInvoice.updateMany({
          where: {
            id: old.invoice_id,
            status: { not: TicketInvoiceStatus.PAID },
          },
          data: { status: TicketInvoiceStatus.VOID },
        });
      }

      void this.audit
        .log({
          entity_type: 'ticket_payment',
          entity_id: old.id,
          action: 'PAYMENT_SUPERSEDED',
          actor_user_id: actorUserId,
          new_state: { reference: old.reference },
          crm_sync_ok: true,
        })
        .catch(() => undefined);
    }
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
      return this.resendPendingPaymentSms(
        crmTicketId,
        dto,
        createdByUserId,
        srData,
      );
    }

    if (!this.bml.canUseGateway() && !this.bml.allowInvoiceWithoutGateway()) {
      throw new BadRequestException(
        'BML is not configured. Set BML_ENABLED=true with BML_AUTH_TOKEN, BML_API_KEY, and BML_REDIRECT_URL, or use development mode for invoice + SMS without live BML.',
      );
    }

    const paymentPhone = this.resolvePaymentPhone(srData, dto);

    if (createdByUserId) {
      await this.billing.markChargeableAfterPaymentInit(
        crmTicketId,
        createdByUserId,
      );
    }

    await this.supersedePendingPayments(
      crmTicketId,
      dto.invoice_id,
      createdByUserId,
    );

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
    if (invoice.status === TicketInvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }
    if (invoice.status === TicketInvoiceStatus.VOID) {
      throw new BadRequestException('Invoice is void');
    }

    const amountMvr = Number(invoice.total_mvr);
    if (!Number.isFinite(amountMvr) || amountMvr <= 0) {
      throw new BadRequestException('Invoice total must be greater than zero');
    }
    const lineItems = invoice.line_items;
    const reference = this.buildReference();
    const customerRef =
      dto.customer_reference ??
      `Invoice ${invoice.invoice_number} — SR ${srData?.number ?? crmTicketId}`;

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

    let bmlTxn: BmlTransactionView | null = null;
    let gatewayMode: 'bml' | 'invoice_only' = 'bml';

    if (this.bml.canUseGateway()) {
      try {
        bmlTxn = await this.bml.createPaymentTransaction({
          localId: reference,
          amountMvr,
          customerReference: customerRef,
          webhookUrl: this.webhookUrl(),
        });
        if (!this.bml.pickPayUrl(bmlTxn)) {
          throw new BadRequestException('BML did not return a payment URL');
        }
      } catch (err) {
        await this.prisma.ticketPayment.update({
          where: { id: payment.id },
          data: {
            status: TicketPaymentStatus.FAILED,
            bml_transaction_id: bmlTxn?.id ?? null,
            metadata: {
              payment_phone: paymentPhone,
              awaiting_payment: false,
              error: (err as Error).message ?? String(err),
            },
          },
        });
        throw err;
      }
    } else {
      gatewayMode = 'invoice_only';
    }

    const bmlPayUrl = bmlTxn ? this.bml.pickPayUrl(bmlTxn) : null;
    const linkForSms = this.normalizeSmsPaymentUrl(
      this.smsPaymentUrl({ reference, bmlPayUrl, gatewayMode }),
    );
    if (gatewayMode !== 'bml') {
      this.assertSmsLinkReachable(linkForSms);
    }

    // Persist the BML transaction before anything else can fail, so a payment
    // made on this link can always be matched back to the ticket.
    await this.prisma.ticketPayment.update({
      where: { id: payment.id },
      data: {
        bml_transaction_id: bmlTxn?.id ?? null,
        bml_state: bmlTxn?.state ?? 'PENDING',
        payment_url: bmlPayUrl,
        metadata: {
          payment_phone: paymentPhone,
          awaiting_payment: true,
          gateway_mode: gatewayMode,
          sms_link: linkForSms,
          ...(bmlPayUrl ? { bml_pay_url: bmlPayUrl } : {}),
          ...(bmlTxn ? { bml: this.bml.toStored(bmlTxn) } : {}),
        } as Prisma.InputJsonValue,
      },
    });

    const resolved = await this.chargeCatalog.resolveLines(lineInputs);
    const itemsText = this.chargeCatalog.formatLinesForSms(resolved.lines);

    await this.sendPaymentSms({
      phone: paymentPhone,
      srNumber: srData?.number ?? crmTicketId,
      invoiceNumber: invoice.invoice_number,
      itemsText,
      totalMvr: amountMvr,
      paymentUrl: linkForSms,
    });

    const crmNote = [
      'Ticketify charge — awaiting payment.',
      `Items: ${itemsText}.`,
      `Invoice ${invoice.invoice_number}. Total MVR ${amountMvr.toFixed(2)} (incl. tax).`,
      `Payment link sent to ${this.maskPhone(paymentPhone)}. Status: AWAITING_PAYMENT.`,
    ].join(' ');

    void this.postCrmChargeNote(crmTicketId, crmNote);

    void this.audit
      .log({
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
          amount_mvr: amountMvr,
          bml_transaction_id: bmlTxn?.id ?? null,
          phone_override: paymentPhone !== this.defaultPhoneFromSr(srData),
          items: itemsText,
        },
        crm_sync_ok: true,
      })
      .catch(() => undefined);

    const linkReachable = !this.isLocalUrl(linkForSms);

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
      payment_url: bmlPayUrl ?? '',
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
    const meta = this.meta(pending);
    if (!pending.payment_url && !meta.sms_link) {
      throw new BadRequestException('No pending payment link to resend');
    }

    let bmlPayUrl: string | null = null;
    if (this.bml.canUseGateway()) {
      bmlPayUrl = await this.ensureBmlCheckoutUrl(pending.reference);
      const refreshed = await this.prisma.ticketPayment.findUnique({
        where: { id: pending.id },
      });
      if (refreshed?.status === TicketPaymentStatus.CONFIRMED) {
        throw new BadRequestException(
          'The customer has already paid. Refresh billing.',
        );
      }
    }

    const paymentPhone = this.resolvePaymentPhone(srData, dto);
    const lineItems = Array.isArray(pending.line_items)
      ? (pending.line_items as Array<{ code: string; quantity?: number }>)
      : [];
    const resolved = await this.chargeCatalog.resolveLines(
      lineItems.map((l) => ({ code: l.code, quantity: l.quantity ?? 1 })),
    );
    const itemsText = this.chargeCatalog.formatLinesForSms(resolved.lines);

    const gatewayMode =
      bmlPayUrl || meta.bml_pay_url
        ? 'bml'
        : meta.gateway_mode ?? 'invoice_only';
    const resolvedBmlPay =
      (bmlPayUrl && this.isBmlHostedPayUrl(bmlPayUrl) ? bmlPayUrl : null) ||
      (meta.bml_pay_url && this.isBmlHostedPayUrl(meta.bml_pay_url)
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

    void this.audit
      .log({
        entity_type: 'ticket_payment',
        entity_id: pending.id,
        action: 'BML_PAYMENT_SMS_RESENT',
        actor_user_id: createdByUserId,
        new_state: { reference: pending.reference },
        crm_sync_ok: true,
      })
      .catch(() => undefined);

    return {
      reference: pending.reference,
      payment_url: resolvedBmlPay ?? pending.payment_url,
      sms_sent: true,
      resent: true,
    };
  }

  async reconcile(reference: string, actorUserId?: string) {
    const payment = await this.prisma.ticketPayment.findUnique({
      where: { reference },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (payment.status === TicketPaymentStatus.CONFIRMED) {
      await this.finalizeConfirmed(payment.id, {
        announce: false,
        repair: true,
      });
      const view = await this.getByReference(reference);
      return { ...view, already_confirmed: true, payment_status: 'confirmed' };
    }

    if (!payment.bml_transaction_id) {
      if (payment.status === TicketPaymentStatus.PENDING) {
        await this.ensureBmlCheckoutUrl(reference);
      }
      const refreshed = await this.getByReference(reference);
      if (!refreshed.bml_transaction_id) {
        return {
          ...refreshed,
          pending: true,
          message: 'Payment not initiated at BML',
        };
      }
    }

    const synced = await this.syncPayment(payment.id, 'staff', actorUserId);
    const view = await this.getByReference(reference);
    return {
      ...view,
      handled: true,
      bml_state: synced?.bml_state ?? view.bml_state,
      ...(view.status === TicketPaymentStatus.CONFIRMED
        ? { payment_status: 'confirmed' }
        : {}),
    };
  }

  // ---------------------------------------------------------------------------
  // Webhook + sync core
  // ---------------------------------------------------------------------------

  async processWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
  ) {
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
    const headerVerified = this.bml.verifyWebhookHeaders(headers);
    const legacyAllowed =
      nodeEnv !== 'production' &&
      this.config.get<string>('BML_ALLOW_LEGACY_WEBHOOK_SIGNATURE') !== 'false';
    const legacyVerified = legacyAllowed
      ? this.bml.verifyLegacyWebhookPayload(payload)
      : false;

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

    // The webhook is only a trigger: the payment is matched to OUR records and
    // the state is re-read from BML, so a forged body cannot confirm anything.
    const payment = localId
      ? await this.prisma.ticketPayment.findUnique({
          where: { reference: String(localId) },
        })
      : transactionId
        ? await this.prisma.ticketPayment.findFirst({
            where: { bml_transaction_id: String(transactionId) },
          })
        : null;

    if (!payment) {
      return { received: true, handled: false, reason: 'payment_not_found' };
    }

    try {
      const synced = await this.syncPayment(payment.id, 'webhook');
      return { received: true, handled: true, status: synced?.status };
    } catch (err) {
      // Acknowledge anyway; the reconciler picks it up on its next pass.
      this.logger.error(
        `Webhook sync failed for ${payment.reference}: ${(err as Error).message}`,
      );
      return { received: true, handled: false, reason: 'sync_deferred' };
    }
  }

  /** Re-reads the payment's BML transaction and applies it. */
  async syncPayment(
    paymentId: string,
    source: SyncSource,
    actorUserId?: string,
  ): Promise<TicketPayment | null> {
    const payment = await this.prisma.ticketPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment?.bml_transaction_id) {
      return payment;
    }
    const txn = await this.bml.getPaymentTransaction(
      payment.bml_transaction_id,
    );
    return this.applyBmlTransaction(payment, txn, source, actorUserId);
  }

  private mismatchReason(
    payment: TicketPayment,
    txn: BmlTransactionView,
  ): string | null {
    if (!txn.localId || txn.localId !== payment.reference) {
      return `localId mismatch (bml=${txn.localId ?? 'none'})`;
    }
    const expectedMinor = this.bml.toMinorUnits(Number(payment.amount_mvr));
    const bmlMinor = txn.amount == null ? NaN : Math.round(Number(txn.amount));
    if (!Number.isFinite(bmlMinor) || bmlMinor !== expectedMinor) {
      return `amount mismatch (expected=${expectedMinor}, bml=${txn.amount ?? 'none'})`;
    }
    if (
      txn.currency &&
      txn.currency.toUpperCase() !== String(payment.currency).toUpperCase()
    ) {
      return `currency mismatch (expected=${payment.currency}, bml=${txn.currency})`;
    }
    if (!txn.currency) {
      return 'currency missing in BML response';
    }
    return null;
  }

  /**
   * Single place where a payment's status changes based on BML. Confirmation is
   * an atomic compare-and-set, so concurrent webhook / return page / reconciler /
   * staff calls produce exactly one receipt, one CRM note and one audit entry.
   */
  private async applyBmlTransaction(
    payment: TicketPayment,
    txn: BmlTransactionView,
    source: SyncSource,
    actorUserId?: string,
  ): Promise<TicketPayment | null> {
    const stored = this.bml.toStored(txn);
    const baseMeta = this.meta(payment);
    const checkedMeta = {
      ...baseMeta,
      bml: stored,
      last_bml_check_at: stored.checked_at,
    };

    if (payment.status === TicketPaymentStatus.CONFIRMED) {
      return payment;
    }

    if (this.bml.isPaymentConfirmed(txn.state)) {
      const mismatch = this.mismatchReason(payment, txn);
      if (mismatch) {
        await this.prisma.ticketPayment.update({
          where: { id: payment.id },
          data: {
            bml_state: txn.state,
            metadata: {
              ...checkedMeta,
              review_required: true,
              review_reason: mismatch,
            } as Prisma.InputJsonValue,
          },
        });
        if (!baseMeta.review_required) {
          this.logger.error(
            `BML confirmation rejected for ${payment.reference}: ${mismatch}`,
          );
          await this.audit
            .log({
              entity_type: 'ticket_payment',
              entity_id: payment.id,
              action: 'BML_PAYMENT_MISMATCH',
              actor_user_id: actorUserId,
              new_state: {
                reference: payment.reference,
                reason: mismatch,
                source,
              },
              crm_sync_ok: false,
              idempotency_key: `bml-mismatch:${payment.reference}`,
            })
            .catch(() => undefined);
        }
        return this.prisma.ticketPayment.findUnique({
          where: { id: payment.id },
        });
      }

      const wasActive = payment.status === TicketPaymentStatus.PENDING;
      const claim = await this.prisma.ticketPayment.updateMany({
        where: {
          id: payment.id,
          status: { not: TicketPaymentStatus.CONFIRMED },
        },
        data: {
          status: TicketPaymentStatus.CONFIRMED,
          confirmed_at: new Date(),
          bml_state: txn.state,
          bml_transaction_id: txn.id ?? payment.bml_transaction_id,
          metadata: {
            ...checkedMeta,
            awaiting_payment: false,
            confirmed_via: source,
            ...(wasActive
              ? {}
              : {
                  review_required: true,
                  review_reason: `Paid after the link was ${payment.status.toLowerCase()} — check for a duplicate charge`,
                }),
          } as Prisma.InputJsonValue,
        },
      });

      await this.finalizeConfirmed(payment.id, {
        announce: claim.count === 1,
        source,
        actorUserId,
      });
      return this.prisma.ticketPayment.findUnique({
        where: { id: payment.id },
      });
    }

    if (
      payment.status === TicketPaymentStatus.PENDING &&
      this.bml.isTerminalFailure(txn)
    ) {
      await this.prisma.ticketPayment.updateMany({
        where: { id: payment.id, status: TicketPaymentStatus.PENDING },
        data: {
          status: this.bml.isClosedState(txn.state)
            ? TicketPaymentStatus.CANCELLED
            : TicketPaymentStatus.FAILED,
          bml_state: txn.state,
          metadata: {
            ...checkedMeta,
            awaiting_payment: false,
          } as Prisma.InputJsonValue,
        },
      });
      void this.audit
        .log({
          entity_type: 'ticket_payment',
          entity_id: payment.id,
          action: 'BML_PAYMENT_CLOSED',
          actor_user_id: actorUserId,
          new_state: {
            reference: payment.reference,
            bml_state: txn.state,
            source,
          },
          crm_sync_ok: true,
          idempotency_key: `bml-closed:${payment.reference}:${txn.state}`,
        })
        .catch(() => undefined);
      return this.prisma.ticketPayment.findUnique({
        where: { id: payment.id },
      });
    }

    return this.prisma.ticketPayment.update({
      where: { id: payment.id },
      data: {
        bml_state: txn.state,
        metadata: checkedMeta as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Idempotent post-confirmation work: invoice → PAID and receipt issued.
   * Only the caller that won the confirmation (`announce`) or an explicit
   * `repair` issues the receipt and the "customer paid" note, so racing callers
   * don't burn receipt numbers or post twice. The audit fires only for the winner.
   */
  async finalizeConfirmed(
    paymentId: string,
    opts: {
      announce: boolean;
      repair?: boolean;
      source?: SyncSource;
      actorUserId?: string;
    },
  ) {
    const payment = await this.prisma.ticketPayment.findUnique({
      where: { id: paymentId },
      include: { invoice: true, receipt: true },
    });
    if (!payment || payment.status !== TicketPaymentStatus.CONFIRMED) return;

    let receipt = payment.receipt;
    if (payment.invoice_id && payment.invoice) {
      await this.prisma.ticketInvoice.updateMany({
        where: {
          id: payment.invoice_id,
          status: { not: TicketInvoiceStatus.PAID },
        },
        data: {
          status: TicketInvoiceStatus.PAID,
          paid_at: payment.confirmed_at ?? new Date(),
        },
      });
      const invoice = await this.invoices.getById(payment.invoice_id);
      if (!receipt && (opts.announce || opts.repair)) {
        try {
          receipt = await this.receipts.issueForPayment(invoice, payment);
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            receipt = await this.prisma.ticketReceipt.findUnique({
              where: { payment_id: payment.id },
            });
          } else {
            throw err;
          }
        }
      }
    }

    if (opts.announce || opts.repair) {
      await this.postPaymentReceivedNote(payment.id);
    }

    if (!opts.announce) return;

    void this.notifyTechnicianPaid(payment);

    await this.audit
      .log({
        entity_type: 'ticket_payment',
        entity_id: payment.id,
        action: 'BML_PAYMENT_CONFIRMED',
        actor_user_id: opts.actorUserId,
        new_state: {
          reference: payment.reference,
          bml_transaction_id: payment.bml_transaction_id,
          amount_mvr: payment.amount_mvr,
          receipt_number: receipt?.receipt_number,
          source: opts.source,
        },
        crm_sync_ok: true,
        idempotency_key: `bml-confirmed:${payment.reference}`,
      })
      .catch(() => undefined);
  }

  private async notifyTechnicianPaid(payment: TicketPayment) {
    if (!payment.created_by_user_id) return;
    let number: string | null = null;
    try {
      const sr = await this.crm.getServiceRequest(
        encodeURIComponent(payment.crm_ticket_id),
      );
      number = (sr.data as { number?: string } | null)?.number ?? null;
    } catch {
      // The push still makes sense without the ticket number.
    }
    await this.push.paymentReceived(payment.created_by_user_id, {
      ticketId: payment.crm_ticket_id,
      number,
      amount: this.formatMvr(payment.amount_mvr),
    });
  }
}
