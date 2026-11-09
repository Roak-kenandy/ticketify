import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TechnicianStockService } from './technician-stock.service';

const cable = {
  id: 'cable',
  code: 'CABLE_2CORE',
  name: '2 Core Cable',
  consumption_uom: 'Meter',
  conversion_factor: new Prisma.Decimal(1000),
  serialized: false,
  allow_decimal: true,
  active: true,
};
const ont = {
  ...cable,
  id: 'ont',
  code: 'ONT_DUAL_BAND',
  name: 'Dual band ONT',
  consumption_uom: 'Unit',
  conversion_factor: new Prisma.Decimal(1),
  serialized: true,
  allow_decimal: false,
};

type Unit = {
  serial_number: string;
  item_id: string;
  status: string;
  technician_user_id: string | null;
};

type Moved = {
  holder: string;
  from?: string | null;
  item_id: string;
  quantity: number;
  type?: 'ISSUE' | 'RETURN';
};

const USERS: Record<string, { name: string; role: string }> = {
  'tech-1': { name: 'Ali', role: 'Technician' },
  'sup-1': { name: 'Hassan', role: 'Supervisor' },
};

function build({
  units = [] as Unit[],
  moved = [] as Moved[],
  consumed = [] as { holder?: string; item_id: string; consumed: number }[],
} = {}) {
  const movements: Record<string, unknown>[] = [];
  const groupBy = jest.fn(async () =>
    moved.map((row) => ({
      technician_user_id: row.holder,
      counterparty_user_id: row.from ?? null,
      item_id: row.item_id,
      type: row.type ?? 'ISSUE',
      condition: row.type === 'RETURN' ? 'GOOD' : null,
      _sum: { quantity: new Prisma.Decimal(row.quantity) },
      _max: { created_at: new Date('2026-10-01T05:00:00Z') },
    })),
  );
  const queryRaw = jest.fn(async (strings: TemplateStringsArray) =>
    strings.join('').includes('pg_advisory_xact_lock')
      ? [{}]
      : consumed.map(({ holder, ...row }) => ({ technician_user_id: holder ?? 'tech-1', ...row })),
  );
  const tx = {
    $queryRaw: queryRaw,
    technicianStockMovement: {
      groupBy,
      create: jest.fn(async ({ data }) => movements.push(data)),
      createMany: jest.fn(async ({ data }) => movements.push(...data)),
    },
    serialUnit: {
      findMany: jest.fn(async ({ where }) =>
        units.filter((unit) => where.serial_number.in.includes(unit.serial_number)),
      ),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    stockRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    ticketInventoryConsumption: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const prisma = {
    ...tx,
    technicianStockMovement: {
      ...tx.technicianStockMovement,
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(async () =>
        movements.map((movement, index) => ({ id: `m${index}`, created_at: new Date(), ...movement })),
      ),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const user = USERS[where.id];
        return user
          ? { id: where.id, name: user.name, email: `${where.id}@example.com`, is_active: true, role: { name: user.role } }
          : null;
      }),
    },
    $transaction: jest.fn(async (fn: (client: unknown) => Promise<void>) => fn(tx)),
  };
  const items = {
    findActive: jest.fn(async (id: string) => ({ cable, ont })[id as 'cable' | 'ont']),
  };
  const audit = { log: jest.fn().mockResolvedValue(true) };
  const service = new TechnicianStockService(prisma as never, audit as never, items as never);
  return { service, movements, tx, audit };
}

const staff = { id: 'inv-1', role: ['Inventory'] };
const supervisor = { id: 'sup-1', role: ['Supervisor'] };
const slip = (holder: string, lines: unknown[], extra: Record<string, unknown> = {}) => ({
  technician_user_id: holder,
  idempotency_key: 'slip123456',
  lines,
  ...extra,
});

describe('TechnicianStockService', () => {
  it('requires a serial number for every ONT issued', async () => {
    const { service } = build();
    await expect(
      service.issue(staff, slip('sup-1', [{ item_id: 'ont', quantity: 2 }]) as never),
    ).rejects.toThrow(/serial number of every unit/);
  });

  it('issues from the store to supervisors only', async () => {
    const { service } = build();
    await expect(
      service.issue(staff, slip('tech-1', [{ item_id: 'cable', quantity: 5 }]) as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('issues one row per ONT serial to the supervisor and converts rolls to metres', async () => {
    const { service, movements, tx, audit } = build();
    await service.issue(
      staff,
      slip('sup-1', [
        { item_id: 'ont', serial_numbers: [' hwtc 0001 ', 'HWTC0002'] },
        { item_id: 'cable', quantity: 2, unit: 'STOCK' },
      ]) as never,
    );
    expect(movements.map((m) => [m.item_id, String(m.quantity), m.serial_number ?? null, m.counterparty_user_id])).toEqual([
      ['ont', '1', 'HWTC0001', null],
      ['ont', '1', 'HWTC0002', null],
      ['cable', '2000', null, null],
    ]);
    expect(tx.serialUnit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: 'WITH_SUPERVISOR', technician_user_id: 'sup-1' }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'STOCK_ISSUED' }));
  });

  it('closes the supervisor request the slip fulfils', async () => {
    const { service, tx } = build();
    tx.stockRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      service.issue(staff, slip('sup-1', [{ item_id: 'cable', quantity: 5 }], { request_id: 'req-1' }) as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.stockRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'req-1', status: 'OPEN', requested_by_user_id: 'sup-1' } }),
    );
  });

  it('refuses to issue an ONT that someone already holds', async () => {
    const { service } = build({
      units: [{ serial_number: 'HWTC0001', item_id: 'ont', status: 'WITH_TECHNICIAN', technician_user_id: 'tech-9' }],
    });
    await expect(
      service.issue(staff, slip('sup-1', [{ item_id: 'ont', serial_numbers: ['HWTC0001'] }]) as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('hands a supervisor ONT to a technician by its exact serial', async () => {
    const { service, movements, tx, audit } = build({
      units: [{ serial_number: 'HWTC0001', item_id: 'ont', status: 'WITH_SUPERVISOR', technician_user_id: 'sup-1' }],
    });
    await service.handOut(supervisor, slip('tech-1', [{ item_id: 'ont', serial_numbers: ['HWTC0001'] }]) as never);
    expect(movements).toEqual([
      expect.objectContaining({
        type: 'ISSUE',
        technician_user_id: 'tech-1',
        counterparty_user_id: 'sup-1',
        serial_number: 'HWTC0001',
      }),
    ]);
    expect(tx.serialUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'WITH_TECHNICIAN', technician_user_id: 'tech-1' }) }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'STOCK_HANDED_OUT' }));
  });

  it('refuses to hand out an ONT the supervisor does not hold', async () => {
    const { service } = build({
      units: [{ serial_number: 'HWTC0001', item_id: 'ont', status: 'WITH_SUPERVISOR', technician_user_id: 'sup-2' }],
    });
    await expect(
      service.handOut(supervisor, slip('tech-1', [{ item_id: 'ont', serial_numbers: ['HWTC0001'] }]) as never),
    ).rejects.toThrow(/not in your stock/);
  });

  it('limits bulk hand-outs to what the supervisor still holds', async () => {
    const { service } = build({
      moved: [
        { holder: 'sup-1', item_id: 'cable', quantity: 1000 },
        { holder: 'tech-1', from: 'sup-1', item_id: 'cable', quantity: 900 },
        { holder: 'tech-1', from: 'sup-1', item_id: 'cable', quantity: 50, type: 'RETURN' },
      ],
    });
    await expect(
      service.handOut(supervisor, slip('tech-1', [{ item_id: 'cable', quantity: 200 }]) as never),
    ).rejects.toThrow(/you only hold 150 Meter/);
  });

  it('only supervisors hand out stock', async () => {
    const { service } = build();
    await expect(
      service.handOut(staff, slip('tech-1', [{ item_id: 'cable', quantity: 1 }]) as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('takes unused items back from a technician into the supervisor stock', async () => {
    const { service, movements, tx } = build({
      units: [{ serial_number: 'HWTC0001', item_id: 'ont', status: 'WITH_TECHNICIAN', technician_user_id: 'tech-1' }],
    });
    await service.takeBack(supervisor, slip('tech-1', [{ item_id: 'ont', serial_numbers: ['HWTC0001'] }]) as never);
    expect(movements[0]).toEqual(
      expect.objectContaining({ type: 'RETURN', condition: 'GOOD', technician_user_id: 'tech-1', counterparty_user_id: 'sup-1' }),
    );
    expect(tx.serialUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'WITH_SUPERVISOR', technician_user_id: 'sup-1' } }),
    );
  });

  it('does not take back more than the technician holds', async () => {
    const { service } = build({
      moved: [{ holder: 'tech-1', from: 'sup-1', item_id: 'cable', quantity: 100 }],
      consumed: [{ item_id: 'cable', consumed: 70 }],
    });
    await expect(
      service.returnStock(staff, slip('tech-1', [{ item_id: 'cable', quantity: 40, condition: 'GOOD' }]) as never),
    ).rejects.toThrow(/only holds 30 Meter/);
  });

  it('balances supervisor and technician stock separately', async () => {
    const { service } = build({
      moved: [
        { holder: 'sup-1', item_id: 'cable', quantity: 1000 },
        { holder: 'tech-1', from: 'sup-1', item_id: 'cable', quantity: 300 },
      ],
      consumed: [{ item_id: 'cable', consumed: 120 }],
    });
    const totals = await service.totals();
    expect(totals.find((row) => row.technician_user_id === 'sup-1')).toMatchObject({
      issued: 1000,
      handed_out: 300,
      in_hand: 700,
    });
    expect(totals.find((row) => row.technician_user_id === 'tech-1')).toMatchObject({
      issued: 300,
      consumed: 120,
      in_hand: 180,
    });
  });

  it('blocks a ticket from using more than was issued, or an ONT issued to someone else', async () => {
    const { service, tx } = build({
      moved: [{ holder: 'tech-1', from: 'sup-1', item_id: 'cable', quantity: 50 }],
      units: [{ serial_number: 'HWTC0009', item_id: 'ont', status: 'WITH_TECHNICIAN', technician_user_id: 'tech-2' }],
    });
    await expect(
      service.assertCanDraw(tx as never, 'tech-1', [{ item: cable, quantity: 60, serial: null }]),
    ).rejects.toThrow(/only have 50 Meter issued/);
    await expect(
      service.assertCanDraw(tx as never, 'tech-1', [{ item: ont, quantity: 1, serial: 'HWTC0009' }]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.assertCanDraw(tx as never, 'tech-1', [{ item: cable, quantity: 50, serial: null }]),
    ).resolves.toBeUndefined();
  });
});
