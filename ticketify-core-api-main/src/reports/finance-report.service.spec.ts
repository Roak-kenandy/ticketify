import { Prisma } from '@prisma/client';
import { FinanceReportService } from './finance-report.service';

const d = (value: string) => new Prisma.Decimal(value);

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    reference: 'ref1',
    crm_ticket_id: 'sr-1',
    invoice_id: 'inv-1',
    amount_mvr: d('100.00'),
    subtotal_mvr: d('92.00'),
    tax_mvr: d('8.00'),
    currency: 'MVR',
    status: 'CONFIRMED',
    bml_transaction_id: 'bml-1',
    line_items: [
      { code: 'A', label: 'Cable', quantity: 1, line_total_mvr: '46.00' },
      { code: 'B', label: 'Connector', quantity: 2, line_total_mvr: '23.00' },
      { code: 'C', label: 'Patch', quantity: 1, line_total_mvr: '23.00' },
    ],
    created_by_user_id: null,
    confirmed_at: new Date('2026-10-01T20:30:00.000Z'),
    updated_at: new Date('2026-10-01T20:30:00.000Z'),
    metadata: null,
    invoice: { invoice_number: 'INV-1', sr_number: 'SR-1' },
    receipt: null,
    ...overrides,
  };
}

function setup(payments: unknown[]) {
  const prisma = {
    ticketPayment: {
      findMany: jest.fn().mockResolvedValue(payments),
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: 0 },
        _sum: { amount_mvr: null, tax_mvr: null },
      }),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const crm = {
    getServiceRequest: jest.fn().mockResolvedValue({ ok: false }),
    request: jest.fn(),
  };
  const service = new FinanceReportService(prisma as never, crm as never);
  return { service, prisma };
}

describe('FinanceReportService', () => {
  it('only queries confirmed payments, filtered by paid date in Maldives time', async () => {
    const { service, prisma } = setup([]);
    await service.list({ from: '2026-10-02', to: '2026-10-02' });

    const where = prisma.ticketPayment.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({
      status: 'CONFIRMED',
      confirmed_at: { not: null },
    });
    expect(where.AND[1].confirmed_at.gte.toISOString()).toBe(
      '2026-10-01T19:00:00.000Z',
    );
    expect(where.AND[1].confirmed_at.lte.toISOString()).toBe(
      '2026-10-02T18:59:59.999Z',
    );
  });

  it('splits GST across lines so the rows add up to the amount paid', async () => {
    const { service } = setup([
      payment({ amount_mvr: d('100.01'), tax_mvr: d('8.01') }),
    ]);
    const rows = await service.list({});

    expect(rows.map((row) => row.product_amount)).toEqual([
      '46.00',
      '23.00',
      '23.00',
    ]);
    const cents = (key: 'gst_amount' | 'total_amount') =>
      rows.reduce((sum, row) => sum + Math.round(Number(row[key]) * 100), 0);
    expect(cents('gst_amount')).toBe(801);
    expect(cents('total_amount')).toBe(10001);
    expect(rows[1].quantity).toBe(2);
  });

  it('uses the issued receipt as the source of truth', async () => {
    const { service } = setup([
      payment({
        receipt: {
          receipt_number: 'RCPT-9',
          sr_number: 'SR-1',
          amount_paid_mvr: d('54.00'),
          tax_mvr: d('4.00'),
          line_items: [{ label: 'ONT', quantity: 1, line_total_mvr: '50.00' }],
        },
      }),
    ]);
    const [row, ...rest] = await service.list({});

    expect(rest).toHaveLength(0);
    expect(row).toMatchObject({
      receipt_no: 'RCPT-9',
      product_name: 'ONT',
      product_amount: '50.00',
      gst_amount: '4.00',
      total_amount: '54.00',
    });
  });

  it('exports amounts as numbers with a totals row', async () => {
    const { service } = setup([payment()]);
    const xml = service.toExcel(await service.list({}));

    expect(xml).toContain('<Data ss:Type="Number">100</Data>');
    expect(xml).toContain('<Data ss:Type="String">2026-10-02 01:30</Data>');
    expect(xml).toContain('<Data ss:Type="String">Total</Data>');
  });

  it('summary only aggregates confirmed payments', async () => {
    const { service, prisma } = setup([]);
    await service.summary();

    for (const [args] of prisma.ticketPayment.aggregate.mock.calls) {
      expect(args.where.status).toBe('CONFIRMED');
    }
    expect(prisma.ticketPayment.findMany.mock.calls[0][0].where.status).toBe(
      'CONFIRMED',
    );
  });
});
