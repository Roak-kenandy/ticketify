import { StockReportService } from './stock-report.service';

describe('StockReportService.log', () => {
  const at = new Date('2026-11-09T08:00:00Z');
  const movement = (overrides: Record<string, unknown>) => ({
    id: Math.random().toString(36),
    batch_id: 'iss:1',
    created_at: at,
    type: 'ISSUE',
    technician_user_id: 'sup-1',
    counterparty_user_id: null,
    performed_by_user_id: 'store-1',
    item_id: 'ont',
    item_name: 'ONT Ooredoo',
    uom: 'PIECE',
    quantity: 1,
    serial_number: null,
    condition: null,
    reference: null,
    notes: null,
    item: { code: 'ONT-OOR' },
    ...overrides,
  });

  const build = (movements: unknown[], requests: unknown[] = []) => {
    const prisma = {
      technicianStockMovement: { findMany: jest.fn().mockResolvedValue(movements) },
      stockRequest: { findMany: jest.fn().mockResolvedValue(requests) },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'sup-1', name: 'Ali', email: 'a@x' },
          { id: 'tech-1', name: 'Hassan', email: 'h@x' },
          { id: 'store-1', name: 'Store Mariyam', email: 's@x' },
        ]),
      },
    };
    return { service: new StockReportService(prisma as never, {} as never), prisma };
  };

  it('groups a slip into item lines with serials and links the request it fulfilled', async () => {
    const { service } = build(
      [
        movement({ serial_number: 'HWTC0002' }),
        movement({ serial_number: 'HWTC0001' }),
        movement({ item_id: 'patch', item_name: 'Patch cord', item: { code: 'PC' }, quantity: 5 }),
      ],
      [
        {
          id: 'req-1',
          fulfilled_batch_id: 'iss:1',
          requested_by_user_id: 'sup-1',
          created_at: new Date('2026-11-08T10:00:00Z'),
          notes: 'Running low',
          lines: [{ item_id: 'ont', item_name: 'ONT Ooredoo', quantity: 2, uom: 'PIECE' }],
        },
      ],
    );

    const [entry] = await service.log({});

    expect(entry).toMatchObject({
      kind: 'STORE_ISSUE',
      from_name: 'Store',
      to_name: 'Ali',
      performed_by_name: 'Store Mariyam',
      request: { requested_by_name: 'Ali', notes: 'Running low' },
    });
    expect(entry.lines).toEqual([
      expect.objectContaining({ item_name: 'ONT Ooredoo', quantity: 2, serials: ['HWTC0001', 'HWTC0002'] }),
      expect.objectContaining({ item_name: 'Patch cord', quantity: 5, serials: [] }),
    ]);
    expect(service.logRows([entry])).toHaveLength(2);
  });

  it('names both sides of supervisor hand-outs and take-backs', async () => {
    const { service } = build([
      movement({ batch_id: 'hnd:1', technician_user_id: 'tech-1', counterparty_user_id: 'sup-1', performed_by_user_id: 'sup-1' }),
      movement({
        batch_id: 'tkb:1',
        type: 'RETURN',
        condition: 'GOOD',
        technician_user_id: 'tech-1',
        counterparty_user_id: 'sup-1',
        performed_by_user_id: 'sup-1',
      }),
    ]);

    const entries = await service.log({});

    expect(entries.map((entry) => [entry.kind, entry.from_name, entry.to_name])).toEqual([
      ['HANDOUT', 'Ali', 'Hassan'],
      ['TAKE_BACK', 'Hassan', 'Ali'],
    ]);
  });

  it('filters by action', async () => {
    const { service, prisma } = build([]);

    await service.log({ type: 'handout' });

    expect(prisma.technicianStockMovement.findMany.mock.calls[0][0].where.AND).toContainEqual({
      type: 'ISSUE',
      counterparty_user_id: { not: null },
    });
  });
});
