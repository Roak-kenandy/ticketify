import { BadRequestException, ConflictException } from '@nestjs/common';
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

function build({
  units = [] as Unit[],
  issued = [] as { item_id: string; quantity: number }[],
  consumed = [] as { item_id: string; consumed: number }[],
} = {}) {
  const movements: Record<string, unknown>[] = [];
  const groupBy = jest.fn(async () =>
    issued.map((row) => ({
      technician_user_id: 'tech-1',
      item_id: row.item_id,
      type: 'ISSUE',
      condition: null,
      _sum: { quantity: new Prisma.Decimal(row.quantity) },
      _max: { created_at: new Date('2026-10-01T05:00:00Z') },
    })),
  );
  const queryRaw = jest.fn(async (strings: TemplateStringsArray) =>
    strings.join('').includes('pg_advisory_xact_lock')
      ? [{}]
      : consumed.map((row) => ({ technician_user_id: 'tech-1', ...row })),
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
      findUnique: jest.fn().mockResolvedValue({
        id: 'tech-1',
        name: 'Ali',
        email: 'ali@example.com',
        is_active: true,
        role: { name: 'Technician' },
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
const slip = (lines: unknown[]) => ({
  technician_user_id: 'tech-1',
  idempotency_key: 'slip123456',
  lines,
});

describe('TechnicianStockService', () => {
  it('requires a serial number for every ONT issued', async () => {
    const { service } = build();
    await expect(
      service.issue(staff, slip([{ item_id: 'ont', quantity: 2 }]) as never),
    ).rejects.toThrow(/serial number of every unit/);
  });

  it('issues one row per ONT serial and converts rolls to metres', async () => {
    const { service, movements, tx, audit } = build();
    await service.issue(
      staff,
      slip([
        { item_id: 'ont', serial_numbers: [' hwtc 0001 ', 'HWTC0002'] },
        { item_id: 'cable', quantity: 2, unit: 'STOCK' },
      ]) as never,
    );
    expect(movements.map((m) => [m.item_id, String(m.quantity), m.serial_number ?? null])).toEqual([
      ['ont', '1', 'HWTC0001'],
      ['ont', '1', 'HWTC0002'],
      ['cable', '2000', null],
    ]);
    expect(tx.serialUnit.upsert).toHaveBeenCalledTimes(2);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'STOCK_ISSUED' }));
  });

  it('refuses to issue an ONT that another technician already holds', async () => {
    const { service } = build({
      units: [{ serial_number: 'HWTC0001', item_id: 'ont', status: 'WITH_TECHNICIAN', technician_user_id: 'tech-9' }],
    });
    await expect(
      service.issue(staff, slip([{ item_id: 'ont', serial_numbers: ['HWTC0001'] }]) as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not take back more than the technician holds', async () => {
    const { service } = build({
      issued: [{ item_id: 'cable', quantity: 100 }],
      consumed: [{ item_id: 'cable', consumed: 70 }],
    });
    await expect(
      service.returnStock(
        staff,
        slip([{ item_id: 'cable', quantity: 40, condition: 'GOOD' }]) as never,
      ),
    ).rejects.toThrow(/only holds 30 Meter/);
  });

  it('blocks a ticket from using more than was issued, or an ONT issued to someone else', async () => {
    const { service, tx } = build({
      issued: [{ item_id: 'cable', quantity: 50 }],
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
