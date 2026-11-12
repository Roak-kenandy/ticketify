import { FinanceSequenceService } from './finance-sequence.service';

function setup(
  stored: { year?: number; seq?: number } | null,
  paymentsThisYear = 0,
) {
  const store = new Map<string, unknown>();
  const tx = {
    systemConfig: {
      findUnique: jest.fn(async ({ where }) =>
        store.has(where.key)
          ? { key: where.key, value: store.get(where.key) }
          : null,
      ),
      update: jest.fn(async ({ where, data }) =>
        store.set(where.key, data.value),
      ),
    },
    ticketPayment: { count: jest.fn().mockResolvedValue(paymentsThisYear) },
    $executeRaw: jest.fn(
      async (_sql: TemplateStringsArray, key: string, value: string) =>
        store.has(key) ? 0 : (store.set(key, JSON.parse(value)), 1),
    ),
    $queryRaw: jest.fn(async (_sql: TemplateStringsArray, key: string) => [
      { value: store.get(key) },
    ]),
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  if (stored) store.set('finance.pay_sequence', stored);
  return { service: new FinanceSequenceService(prisma as never), tx };
}

describe('FinanceSequenceService', () => {
  const year = new Date().getFullYear();

  it('continues the counter within the year', async () => {
    const { service } = setup({ year, seq: 41 });
    await expect(service.next('PAY')).resolves.toEqual({ year, seq: 42 });
    await expect(service.next('PAY')).resolves.toEqual({ year, seq: 43 });
  });

  it('restarts at 1 in a new year', async () => {
    const { service } = setup({ year: year - 1, seq: 900 });
    await expect(service.next('PAY')).resolves.toEqual({ year, seq: 1 });
  });

  it('seeds the payment counter from payments already made this year', async () => {
    const { service, tx } = setup(null, 120);
    await expect(service.next('PAY')).resolves.toEqual({ year, seq: 121 });
    expect(tx.ticketPayment.count).toHaveBeenCalledTimes(1);
  });

  it('keeps the invoice number format', async () => {
    const { service, tx } = setup(null);
    await expect(service.nextNumber('INV')).resolves.toBe(`INV-${year}-000001`);
    expect(tx.ticketPayment.count).not.toHaveBeenCalled();
  });
});
