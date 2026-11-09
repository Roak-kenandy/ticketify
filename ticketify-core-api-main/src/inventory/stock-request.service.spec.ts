import { StockRequestService } from './stock-request.service';

describe('StockRequestService.alerts', () => {
  const request = (overrides: Record<string, unknown> = {}) => ({
    id: 'req-1',
    requested_by_user_id: 'sup-1',
    status: 'OPEN',
    lines: [{ item_id: 'ont', item_name: 'ONT Ooredoo', quantity: 10, uom: 'PIECE' }],
    notes: null,
    closed_by_user_id: null,
    closed_at: null,
    created_at: new Date('2026-11-09T08:00:00Z'),
    ...overrides,
  });

  const build = (rows: unknown[]) => {
    const prisma = {
      stockRequest: { findMany: jest.fn().mockResolvedValue(rows) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'sup-1', name: 'Ali', email: 'ali@x' }]) },
    };
    const service = new StockRequestService(prisma as never, {} as never, {} as never, {} as never);
    return { service, prisma };
  };

  it('tells the store about every open request with who asked and what', async () => {
    const { service, prisma } = build([request()]);

    const result = await service.alerts({ id: 'store-1', role: 'Inventory' });

    expect(prisma.stockRequest.findMany.mock.calls[0][0].where).toEqual({ status: 'OPEN' });
    expect(result.audience).toBe('STORE');
    expect(result.items).toEqual([
      expect.objectContaining({
        key: 'req-1:OPEN',
        title: 'Stock request from Ali',
        body: 'ONT Ooredoo × 10 PIECE',
      }),
    ]);
  });

  it('tells a supervisor only about their own requests the store closed', async () => {
    const closedAt = new Date('2026-11-09T09:00:00Z');
    const { service, prisma } = build([
      request({ status: 'FULFILLED', closed_by_user_id: 'store-1', closed_at: closedAt }),
      request({ id: 'req-2', status: 'CANCELLED', closed_by_user_id: 'store-1', closed_at: closedAt }),
    ]);

    const result = await service.alerts({ id: 'sup-1', role: 'Supervisor' });

    const where = prisma.stockRequest.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      requested_by_user_id: 'sup-1',
      status: { in: ['FULFILLED', 'CANCELLED'] },
      NOT: { closed_by_user_id: 'sup-1' },
    });
    expect(result.audience).toBe('SUPERVISOR');
    expect(result.items.map((item) => [item.key, item.title])).toEqual([
      ['req-1:FULFILLED', 'Your stock request was issued'],
      ['req-2:CANCELLED', 'Your stock request was declined'],
    ]);
  });
});
