import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TicketPaymentStatus } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { BmlPaymentService } from './bml-payment.service';
import { TicketPaymentService } from './ticket-payment.service';

const TICK_MS = 60_000;
const BATCH_SIZE = 25;
/** BML payment links live ~7 days; watch a little longer for late confirmations. */
const WATCH_WINDOW_MS = 9 * 24 * 60 * 60 * 1000;
const STORED_BML_KEYS = new Set([
  'id',
  'local_id',
  'state',
  'amount_minor',
  'currency',
  'pay_url',
  'expires_at',
  'checked_at',
]);

/**
 * Safety net for missed webhooks and customers who close the browser before the
 * return page loads. Polls BML for every open payment with age-based backoff.
 */
@Injectable()
export class PaymentReconcilerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentReconcilerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private bml: BmlPaymentService,
    private payments: TicketPaymentService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    this.warnOnUnsafeConfig();
    void this.scrubStoredGatewayPayloads();
    if (this.config.get<string>('PAYMENT_RECONCILER_ENABLED') === 'false') {
      this.logger.warn(
        'Payment reconciler disabled (PAYMENT_RECONCILER_ENABLED=false)',
      );
      return;
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Minimum gap between BML checks for one payment, based on its age. */
  private checkInterval(ageMs: number): number {
    const minute = 60_000;
    if (ageMs < 60 * minute) return minute;
    if (ageMs < 24 * 60 * minute) return 10 * minute;
    return 60 * minute;
  }

  async tick() {
    if (this.running || !this.bml.canUseGateway()) return;
    this.running = true;
    try {
      await this.repairConfirmedWithoutReceipt();
      await this.pollOpenPayments();
    } catch (err) {
      this.logger.error(`Reconciler tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async pollOpenPayments() {
    const now = Date.now();
    const candidates = await this.prisma.ticketPayment.findMany({
      where: {
        status: { not: TicketPaymentStatus.CONFIRMED },
        bml_transaction_id: { not: null },
        created_at: { gte: new Date(now - WATCH_WINDOW_MS) },
        OR: [
          { bml_state: null },
          { bml_state: { notIn: ['EXPIRED', 'CANCELLED', 'VOIDED'] } },
        ],
      },
      orderBy: { updated_at: 'asc' },
      take: BATCH_SIZE * 4,
      select: { id: true, reference: true, created_at: true, metadata: true },
    });

    const due = candidates
      .filter((p) => {
        const last = (p.metadata as { last_bml_check_at?: string } | null)
          ?.last_bml_check_at;
        if (!last) return true;
        const age = now - p.created_at.getTime();
        return now - new Date(last).getTime() >= this.checkInterval(age);
      })
      .slice(0, BATCH_SIZE);

    for (const p of due) {
      try {
        const synced = await this.payments.syncPayment(p.id, 'reconciler');
        if (synced?.status === TicketPaymentStatus.CONFIRMED) {
          this.logger.log(`Payment ${p.reference} confirmed by reconciler`);
        }
      } catch (err) {
        this.logger.warn(
          `Reconcile ${p.reference} failed: ${(err as Error).message}`,
        );
      }
    }
  }

  /** Finishes confirmations whose receipt or CRM "customer paid" note didn't go through. */
  private async repairConfirmedWithoutReceipt() {
    const now = Date.now();
    const recent = await this.prisma.ticketPayment.findMany({
      where: {
        status: TicketPaymentStatus.CONFIRMED,
        // Leave in-flight confirmations to the caller that is finishing them.
        confirmed_at: {
          lt: new Date(now - 2 * 60_000),
          gte: new Date(now - 7 * 24 * 60 * 60_000),
        },
      },
      orderBy: { confirmed_at: 'desc' },
      take: 200,
      select: {
        id: true,
        reference: true,
        invoice_id: true,
        metadata: true,
        receipt: { select: { id: true } },
      },
    });
    const broken = recent
      .filter(
        (p) =>
          (p.invoice_id && !p.receipt) ||
          !(p.metadata as { crm_paid_note_at?: string } | null)
            ?.crm_paid_note_at,
      )
      .slice(0, BATCH_SIZE);

    for (const p of broken) {
      try {
        await this.payments.finalizeConfirmed(p.id, {
          announce: false,
          repair: true,
        });
      } catch (err) {
        this.logger.error(
          `Confirmation repair ${p.reference} failed: ${(err as Error).message}`,
        );
      }
    }
  }

  /** Older builds stored the full BML payload (card/token data). Reduce it to the whitelist. */
  private async scrubStoredGatewayPayloads() {
    try {
      let cursor: string | undefined;
      let scrubbed = 0;
      for (;;) {
        const rows = await this.prisma.ticketPayment.findMany({
          where: { metadata: { not: Prisma.DbNull } },
          select: { id: true, metadata: true },
          orderBy: { id: 'asc' },
          take: 200,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (!rows.length) break;
        cursor = rows[rows.length - 1].id;

        for (const row of rows) {
          const meta = row.metadata as Record<string, unknown> | null;
          const bml = meta?.bml as Record<string, unknown> | undefined;
          if (!bml || Object.keys(bml).every((k) => STORED_BML_KEYS.has(k)))
            continue;
          const stored = {
            id: (bml.id as string) ?? null,
            local_id: (bml.localId as string) ?? null,
            state: String(bml.state ?? ''),
            amount_minor: typeof bml.amount === 'number' ? bml.amount : null,
            currency: (bml.currency as string) ?? null,
            pay_url: (bml.shortUrl as string) || (bml.url as string) || null,
            expires_at: (bml.expires as string) ?? null,
            checked_at: new Date().toISOString(),
          };
          await this.prisma.ticketPayment.update({
            where: { id: row.id },
            data: {
              metadata: { ...meta, bml: stored } as Prisma.InputJsonValue,
            },
          });
          scrubbed++;
        }
      }
      if (scrubbed) {
        this.logger.log(
          `Removed stored gateway card/token data from ${scrubbed} payment(s)`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Gateway payload scrub failed: ${(err as Error).message}`,
      );
    }
  }

  private warnOnUnsafeConfig() {
    if (!this.bml.canUseGateway()) return;
    const production =
      (this.config.get<string>('NODE_ENV') ?? 'development') === 'production';
    const redirect = this.config.get<string>('BML_REDIRECT_URL')?.trim() ?? '';
    const localRedirect = /localhost|127\.0\.0\.1|10\.0\.2\.2/i.test(redirect);
    if (localRedirect) {
      const msg = `BML_REDIRECT_URL (${redirect}) is a local address — customers paying on their phone cannot return to it. Use the public HTTPS admin URL, e.g. https://<admin-domain>/payments/return`;
      if (production) this.logger.error(msg);
      else this.logger.warn(msg);
    } else if (production && !redirect.startsWith('https://')) {
      this.logger.error('BML_REDIRECT_URL must use HTTPS in production');
    }
    const hasWebhook =
      this.config.get<string>('BML_WEBHOOK_URL')?.trim() ||
      this.config.get<string>('PUBLIC_API_BASE_URL')?.trim();
    if (!hasWebhook) {
      this.logger.warn(
        'No BML webhook URL (BML_WEBHOOK_URL / PUBLIC_API_BASE_URL). Payments will be confirmed by the return page and the reconciler only.',
      );
    } else if (!this.config.get<string>('BML_API_KEY')?.trim()) {
      this.logger.warn(
        'BML_API_KEY is not set — BML webhooks cannot be verified and will be rejected.',
      );
    }
  }
}
