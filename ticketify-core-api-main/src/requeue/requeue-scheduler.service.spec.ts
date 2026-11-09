import { TicketPaymentStatus } from '@prisma/client';
import { RequeueSchedulerService } from './requeue-scheduler.service';

function build(
  opts: {
    syncedStatus?: TicketPaymentStatus;
    activityState?: string;
    watchFrom?: string;
  } = {},
) {
  const payment = {
    id: 'pay-1',
    reference: 'TKT-PAY-1',
    crm_ticket_id: 'sr-1',
    amount_mvr: 250,
    metadata: { payment_phone: '7771234' },
  };
  const prisma = {
    integrationAuditLog: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([
          { entity_id: 'sr-9', new_state: { activity_id: 'act-1' } },
        ])
        .mockResolvedValueOnce([]),
    },
    ticketPayment: {
      findMany: jest.fn().mockResolvedValue([payment]),
      findUnique: jest.fn().mockResolvedValue({ metadata: payment.metadata }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const crm = {
    getActivity: jest.fn().mockResolvedValue({
      ok: true,
      data: { state: opts.activityState ?? 'COMPLETED' },
    }),
  };
  const requeue = {
    moveToNew: jest.fn().mockResolvedValue({ moved: true, unassigned: true }),
    alreadyHandled: jest.fn().mockResolvedValue(false),
  };
  const payments = {
    syncPayment: jest.fn().mockResolvedValue({
      status: opts.syncedStatus ?? TicketPaymentStatus.PENDING,
    }),
  };
  const config = {
    get: jest.fn((key: string) =>
      key === 'REQUEUE_WATCH_FROM' ? opts.watchFrom : undefined,
    ),
  };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const scheduler = new RequeueSchedulerService(
    prisma as never,
    crm as never,
    requeue as never,
    payments as never,
    config as never,
    logger as never,
  );
  return { scheduler, prisma, requeue };
}

describe('RequeueSchedulerService', () => {
  it('moves a ticket back to New when its Last Mile activity was completed in CRM', async () => {
    const { scheduler, requeue } = build();
    await scheduler.requeueCompletedLastMile();
    expect(requeue.moveToNew).toHaveBeenCalledWith(
      'sr-9',
      expect.stringContaining('Last Mile cabling completed'),
      expect.objectContaining({
        action: 'LM_COMPLETED_REQUEUE',
        key: 'lm-requeue:act-1',
      }),
    );
  });

  it('leaves tickets whose Last Mile activity is still pending', async () => {
    const { scheduler, requeue } = build({ activityState: 'PENDING' });
    await scheduler.requeueCompletedLastMile();
    expect(requeue.moveToNew).not.toHaveBeenCalled();
  });

  it('moves a ticket unpaid after 8 hours to New and marks the payment', async () => {
    const { scheduler, requeue, prisma } = build();
    await scheduler.requeueUnpaid();
    expect(requeue.moveToNew).toHaveBeenCalledWith(
      'sr-1',
      expect.stringContaining('not paid MVR 250.00 within 8 hours'),
      expect.objectContaining({
        action: 'UNPAID_REQUEUE',
        key: 'payment-requeue:pay-1',
      }),
    );
    expect(prisma.ticketPayment.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: {
        metadata: expect.objectContaining({
          payment_phone: '7771234',
          requeued_at: expect.any(String),
        }),
      },
    });
  });

  it('does not move the ticket when BML shows the customer just paid', async () => {
    const { scheduler, requeue } = build({
      syncedStatus: TicketPaymentStatus.CONFIRMED,
    });
    await scheduler.requeueUnpaid();
    expect(requeue.moveToNew).not.toHaveBeenCalled();
  });

  it('ignores handoffs and payment links created before the watch start', async () => {
    const watchFrom = new Date(Date.now() - 60 * 60_000).toISOString();
    const { scheduler, prisma } = build({ watchFrom });
    await scheduler.requeueCompletedLastMile();
    await scheduler.requeueUnpaid();
    const lmSince = prisma.integrationAuditLog.findMany.mock.calls[0][0].where
      .created_at.gte as Date;
    const paySince = prisma.ticketPayment.findMany.mock.calls[0][0].where
      .created_at.gte as Date;
    expect(lmSince.toISOString()).toBe(watchFrom);
    expect(paySince.toISOString()).toBe(watchFrom);
  });
});
