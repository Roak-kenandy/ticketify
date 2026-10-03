import { ForbiddenException } from '@nestjs/common';
import { TicketInvoiceStatus, TicketPaymentStatus } from '@prisma/client';
import { BmlPaymentService, BmlTransactionView } from './bml-payment.service';
import { TicketPaymentService } from './ticket-payment.service';

type Row = Record<string, any>;

/** Minimal in-memory Prisma double that honours the status guards used for claims. */
function createPrisma(payment: Row, invoice: Row) {
  const db = {
    payment: { ...payment },
    invoice: { ...invoice },
    receipts: [] as Row[],
  };
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, cond]) => {
      if (cond && typeof cond === 'object' && 'not' in cond)
        return row[key] !== cond.not;
      return row[key] === cond;
    });

  const prisma = {
    ticketPayment: {
      findUnique: jest.fn(async ({ where, include }: Row) => {
        const hit =
          (where.id && where.id === db.payment.id) ||
          (where.reference && where.reference === db.payment.reference);
        if (!hit) return null;
        return {
          ...db.payment,
          ...(include?.invoice ? { invoice: db.invoice } : {}),
          ...(include?.receipt
            ? {
                receipt:
                  db.receipts.find((r) => r.payment_id === db.payment.id) ??
                  null,
              }
            : {}),
        };
      }),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        if (!matches(db.payment, where)) return { count: 0 };
        Object.assign(db.payment, data);
        return { count: 1 };
      }),
      update: jest.fn(async ({ data }: Row) => Object.assign(db.payment, data)),
    },
    ticketInvoice: {
      updateMany: jest.fn(async ({ where, data }: Row) => {
        if (!matches(db.invoice, where)) return { count: 0 };
        Object.assign(db.invoice, data);
        return { count: 1 };
      }),
    },
    ticketReceipt: {
      findUnique: jest.fn(
        async ({ where }: Row) =>
          db.receipts.find((r) => r.payment_id === where.payment_id) ?? null,
      ),
    },
  };
  return { db, prisma };
}

function txn(overrides: Partial<BmlTransactionView> = {}): BmlTransactionView {
  return {
    id: 'bml-1',
    localId: 'TKT-PAY-TEST-abc123',
    state: 'CONFIRMED',
    url: 'https://pay.bml.com.mv/x',
    shortUrl: null,
    qrImageUrl: null,
    amount: 27000,
    currency: 'MVR',
    allowRetry: true,
    expiresAt: null,
    raw: { paymentToken: 'secret-token', paddedCardNumber: '4111********1111' },
    ...overrides,
  };
}

function setup(gatewayTxn: BmlTransactionView, paymentOverrides: Row = {}) {
  const { db, prisma } = createPrisma(
    {
      id: 'pay-1',
      reference: 'TKT-PAY-TEST-abc123',
      crm_ticket_id: 'sr-1',
      invoice_id: 'inv-1',
      amount_mvr: 270,
      subtotal_mvr: 250,
      tax_mvr: 20,
      line_items: [
        {
          code: 'EXTRA_CABLE',
          label: 'Extra cable',
          quantity: 2,
          line_total_mvr: '250.00',
        },
      ],
      currency: 'MVR',
      status: TicketPaymentStatus.PENDING,
      bml_transaction_id: 'bml-1',
      bml_state: 'QR_CODE_GENERATED',
      confirmed_at: null,
      metadata: { payment_phone: '7771234' },
      ...paymentOverrides,
    },
    {
      id: 'inv-1',
      invoice_number: 'INV-1',
      status: TicketInvoiceStatus.ISSUED,
      crm_ticket_id: 'sr-1',
    },
  );

  const config = {
    get: jest.fn(
      (key: string) =>
        (
          ({
            BML_ENABLED: 'true',
            BML_AUTH_TOKEN: 't',
            BML_REDIRECT_URL: 'https://x/return',
            NODE_ENV: 'production',
            BML_API_KEY: 'k',
            CRM_BACKOFFICE_API_URL: 'https://crm.test',
          }) as Row
        )[key],
    ),
  };
  const bml = new BmlPaymentService(config as any);
  jest.spyOn(bml, 'getPaymentTransaction').mockResolvedValue(gatewayTxn);

  const receipts = {
    issueForPayment: jest.fn(async (_inv: Row, payment: Row) => {
      const receipt = { receipt_number: 'RCP-1', payment_id: payment.id };
      db.receipts.push(receipt);
      return receipt;
    }),
  };
  const invoices = { getById: jest.fn(async () => db.invoice) };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new TicketPaymentService(
    prisma as any,
    bml,
    {} as any,
    config as any,
    audit as any,
    invoices as any,
    receipts as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { paymentReceived: jest.fn().mockResolvedValue(true) } as any,
  );
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue({ ok: true } as Response);
  return { service, db, receipts, audit, fetchMock };
}

const crmNotes = (fetchMock: jest.SpyInstance) =>
  fetchMock.mock.calls
    .filter(([url]) => String(url).includes('/notes'))
    .map(
      ([, init]) =>
        JSON.parse((init as RequestInit).body as string).note as string,
    );

const confirmedAudits = (audit: { log: jest.Mock }) =>
  audit.log.mock.calls.filter(
    ([entry]) => entry.action === 'BML_PAYMENT_CONFIRMED',
  );

describe('TicketPaymentService BML sync', () => {
  afterEach(() => jest.restoreAllMocks());

  it('confirms a matching payment once, even when two syncs race', async () => {
    const { service, db, receipts, audit } = setup(txn());

    await Promise.all([
      service.syncPayment('pay-1', 'webhook'),
      service.syncPayment('pay-1', 'return_page'),
    ]);

    expect(db.payment.status).toBe(TicketPaymentStatus.CONFIRMED);
    expect(db.invoice.status).toBe(TicketInvoiceStatus.PAID);
    expect(receipts.issueForPayment).toHaveBeenCalledTimes(1);
    expect(confirmedAudits(audit)).toHaveLength(1);
  });

  it('posts one "customer paid" note with amount and items on the ticket', async () => {
    const { service, fetchMock, db } = setup(txn());
    await Promise.all([
      service.syncPayment('pay-1', 'webhook'),
      service.syncPayment('pay-1', 'return_page'),
    ]);
    const notes = crmNotes(fetchMock);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('customer paid MVR 270.00');
    expect(notes[0]).toContain('Extra cable × 2 (MVR 250.00)');
    expect(notes[0]).toContain('Invoice INV-1');
    expect(notes[0]).toContain('Receipt RCP-1');
    expect(db.payment.metadata.crm_paid_note_at).toBeTruthy();
  });

  it('leaves the note unmarked when the CRM rejects it so it is retried', async () => {
    const { service, fetchMock, db } = setup(txn());
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);
    await service.syncPayment('pay-1', 'webhook');
    expect(db.payment.status).toBe(TicketPaymentStatus.CONFIRMED);
    expect(db.payment.metadata.crm_paid_note_at).toBeUndefined();

    fetchMock.mockResolvedValue({ ok: true } as Response);
    await service.finalizeConfirmed('pay-1', { announce: false, repair: true });
    expect(db.payment.metadata.crm_paid_note_at).toBeTruthy();
    expect(crmNotes(fetchMock)).toHaveLength(2);
  });

  it('never stores card or token data from the gateway', async () => {
    const { service, db } = setup(txn());
    await service.syncPayment('pay-1', 'reconciler');
    const stored = JSON.stringify(db.payment.metadata);
    expect(stored).not.toContain('secret-token');
    expect(stored).not.toContain('4111');
  });

  it.each([
    ['amount differs', { amount: 2700 }],
    ['amount missing', { amount: null }],
    ['reference differs', { localId: 'TKT-PAY-OTHER-zzz' }],
    ['currency differs', { currency: 'USD' }],
  ])('refuses to confirm when %s', async (_label, overrides) => {
    const { service, db, receipts } = setup(txn(overrides));
    await service.syncPayment('pay-1', 'webhook');
    expect(db.payment.status).toBe(TicketPaymentStatus.PENDING);
    expect(db.payment.metadata.review_required).toBe(true);
    expect(receipts.issueForPayment).not.toHaveBeenCalled();
  });

  it('keeps a payment open after a retryable card failure', async () => {
    const { service, db } = setup(txn({ state: 'FAILED', allowRetry: true }));
    await service.syncPayment('pay-1', 'reconciler');
    expect(db.payment.status).toBe(TicketPaymentStatus.PENDING);
    expect(db.payment.bml_state).toBe('FAILED');
  });

  it('closes a payment whose BML link expired', async () => {
    const { service, db } = setup(txn({ state: 'EXPIRED' }));
    await service.syncPayment('pay-1', 'reconciler');
    expect(db.payment.status).toBe(TicketPaymentStatus.CANCELLED);
  });

  it('records a late payment on a superseded link and flags it for review', async () => {
    const { service, db, receipts } = setup(txn(), {
      status: TicketPaymentStatus.CANCELLED,
    });
    await service.syncPayment('pay-1', 'reconciler');
    expect(db.payment.status).toBe(TicketPaymentStatus.CONFIRMED);
    expect(db.payment.metadata.review_required).toBe(true);
    expect(receipts.issueForPayment).toHaveBeenCalledTimes(1);
  });

  it('rejects webhooks without a valid signature', async () => {
    const { service } = setup(txn());
    await expect(
      service.processWebhook(
        { localId: 'TKT-PAY-TEST-abc123', state: 'CONFIRMED' },
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('acknowledges signed webhooks for unknown payments without acting', async () => {
    const { service } = setup(txn());
    const bml = (service as any).bml as BmlPaymentService;
    jest.spyOn(bml, 'verifyWebhookHeaders').mockReturnValue(true);
    const result = await service.processWebhook(
      { localId: 'TKT-PAY-NOPE-000' },
      {},
    );
    expect(result).toEqual({
      received: true,
      handled: false,
      reason: 'payment_not_found',
    });
  });

  it('confirms via a signed webhook by re-reading BML, ignoring the body state', async () => {
    const { service, db } = setup(txn({ state: 'QR_CODE_GENERATED' }));
    const bml = (service as any).bml as BmlPaymentService;
    jest.spyOn(bml, 'verifyWebhookHeaders').mockReturnValue(true);
    await service.processWebhook(
      { localId: 'TKT-PAY-TEST-abc123', state: 'CONFIRMED' },
      {},
    );
    expect(db.payment.status).toBe(TicketPaymentStatus.PENDING);
  });
});
