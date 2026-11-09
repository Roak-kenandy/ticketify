import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TicketPaymentStatus } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { CrmApiClient } from 'src/infrastructure/crm/crm-api.client';
import { LoggerService } from 'src/infrastructure/logger/logger.service';
import { TicketPaymentService } from 'src/payments/ticket-payment.service';
import { ServiceRequestRequeueService } from './service-request-requeue.service';

const TICK_MS = 5 * 60_000;
export const UNPAID_REQUEUE_MS = 8 * 60 * 60_000;
/** Handoffs and payment links older than this are no longer watched. */
const LM_WATCH_MS = 60 * 24 * 60 * 60_000;
const PAYMENT_WATCH_MS = 9 * 24 * 60 * 60_000;
const BATCH = 25;
const FIRST_TICK_MS = 30_000;
/** Handoffs and payment links created before the feature went live are never moved. */
const DEFAULT_WATCH_FROM = '2026-11-09T00:00:00+05:00';

export const lmRequeueKey = (activityId: string) => `lm-requeue:${activityId}`;
export const paymentRequeueKey = (paymentId: string) =>
  `payment-requeue:${paymentId}`;

/**
 * Every 5 minutes: tickets whose Last Mile activity was completed in CRM, and tickets
 * whose payment link is still unpaid 8 hours later, go back to New (unassigned).
 */
@Injectable()
export class RequeueSchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private firstTick: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmApiClient,
    private readonly requeue: ServiceRequestRequeueService,
    private readonly payments: TicketPaymentService,
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit() {
    const flag = this.config.get<string>('REQUEUE_SCHEDULER_ENABLED');
    const production = this.config.get<string>('NODE_ENV') === 'production';
    // Off by default outside production: a local API talks to the real CRM.
    if (flag === 'false' || (!production && flag !== 'true')) {
      this.logger.warn(
        'Requeue',
        'Scheduler off (set REQUEUE_SCHEDULER_ENABLED=true to enable)',
      );
      return;
    }
    this.firstTick = setTimeout(() => void this.tick(), FIRST_TICK_MS);
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.firstTick) clearTimeout(this.firstTick);
    if (this.timer) clearInterval(this.timer);
  }

  private since(windowMs: number): Date {
    const configured = new Date(
      this.config.get<string>('REQUEUE_WATCH_FROM') || DEFAULT_WATCH_FROM,
    );
    const windowStart = Date.now() - windowMs;
    return new Date(
      Number.isNaN(configured.getTime())
        ? windowStart
        : Math.max(configured.getTime(), windowStart),
    );
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.requeueCompletedLastMile();
      await this.requeueUnpaid();
    } catch (err) {
      this.logger.error('Requeue', `Tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  async requeueCompletedLastMile() {
    const handoffs = await this.prisma.integrationAuditLog.findMany({
      where: {
        action: 'LM_HANDOFF',
        created_at: { gte: this.since(LM_WATCH_MS) },
      },
      orderBy: { created_at: 'desc' },
      select: { entity_id: true, new_state: true },
    });
    const pending = handoffs
      .map((row) => ({
        ticketId: row.entity_id,
        activityId: (row.new_state as { activity_id?: string } | null)
          ?.activity_id,
      }))
      .filter((row): row is { ticketId: string; activityId: string } =>
        Boolean(row.activityId),
      );
    if (!pending.length) return;

    const handled = new Set(
      (
        await this.prisma.integrationAuditLog.findMany({
          where: {
            idempotency_key: {
              in: pending.map((row) => lmRequeueKey(row.activityId)),
            },
          },
          select: { idempotency_key: true },
        })
      ).map((row) => row.idempotency_key),
    );

    for (const row of pending
      .filter((each) => !handled.has(lmRequeueKey(each.activityId)))
      .slice(0, BATCH)) {
      const activity = await this.crm.getActivity(row.activityId);
      if (!activity.ok) continue;
      if (activityState(activity.data) !== 'COMPLETED') continue;
      await this.requeue.moveToNew(
        row.ticketId,
        'Last Mile cabling completed by the Transport team. Ticket moved back to New for the Access team.',
        {
          action: 'LM_COMPLETED_REQUEUE',
          key: lmRequeueKey(row.activityId),
          details: { activity_id: row.activityId },
        },
      );
    }
  }

  async requeueUnpaid() {
    const now = Date.now();
    const overdue = await this.prisma.ticketPayment.findMany({
      where: {
        status: TicketPaymentStatus.PENDING,
        created_at: {
          lte: new Date(now - UNPAID_REQUEUE_MS),
          gte: this.since(PAYMENT_WATCH_MS),
        },
      },
      orderBy: { created_at: 'asc' },
      take: BATCH * 4,
      select: {
        id: true,
        reference: true,
        crm_ticket_id: true,
        amount_mvr: true,
        metadata: true,
      },
    });

    for (const payment of overdue
      .filter(
        (p) => !(p.metadata as { requeued_at?: string } | null)?.requeued_at,
      )
      .slice(0, BATCH)) {
      // The customer may have just paid: check BML before moving the ticket.
      const synced = await this.payments
        .syncPayment(payment.id, 'reconciler')
        .catch(() => null);
      if (synced && synced.status !== TicketPaymentStatus.PENDING) continue;

      const result = await this.requeue.moveToNew(
        payment.crm_ticket_id,
        `Customer has not paid MVR ${Number(payment.amount_mvr).toFixed(2)} within 8 hours of the payment link (${payment.reference}). Ticket moved back to New; the link stays open.`,
        {
          action: 'UNPAID_REQUEUE',
          key: paymentRequeueKey(payment.id),
          details: { reference: payment.reference },
        },
      );
      if (
        result.moved ||
        (await this.requeue.alreadyHandled(paymentRequeueKey(payment.id)))
      ) {
        const current = await this.prisma.ticketPayment.findUnique({
          where: { id: payment.id },
          select: { metadata: true },
        });
        await this.prisma.ticketPayment.update({
          where: { id: payment.id },
          data: {
            metadata: {
              ...((current?.metadata as Record<string, unknown> | null) ?? {}),
              requeued_at: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
      }
    }
  }
}

function activityState(data: unknown): string {
  const activity = data as {
    state?: string;
    states?: { state: string; date: number }[];
  } | null;
  if (activity?.state) return activity.state;
  const states = activity?.states ?? [];
  return states.length
    ? [...states].sort((a, b) => b.date - a.date)[0].state
    : '';
}
