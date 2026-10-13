import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  effectiveQuantity,
  normalizeSerial,
  TicketInventoryService,
} from './ticket-inventory.service';
import { InventoryDeclarationDto } from './dto/inventory.dto';

const cable = {
  id: 'cable',
  code: 'CABLE_2CORE',
  name: '2 Core Cable',
  consumption_uom: 'Meter',
  serialized: false,
  allow_decimal: true,
  remarks_required: false,
  active: true,
};
const ont = {
  ...cable,
  id: 'ont',
  code: 'ONT_DUAL_BAND',
  name: 'Dual band ONT',
  consumption_uom: 'Unit',
  serialized: true,
  allow_decimal: false,
};
const clip = {
  ...cable,
  id: 'clip',
  code: 'CABLE_CLIPS',
  name: 'Cable clips',
  consumption_uom: 'Piece',
  allow_decimal: false,
};

function build(
  existing: {
    serial_number: string;
    sr_number: string;
    crm_ticket_id: string;
  } | null = null,
) {
  const created: Record<string, unknown>[] = [];
  const prisma = {
    integrationAuditLog: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    ticketInventoryDeclaration: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    ticketInventoryConsumption: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(existing),
    },
    provisioningTransaction: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        ticketInventoryDeclaration: { upsert: jest.fn() },
        ticketInventoryConsumption: {
          create: jest.fn(async ({ data }) => created.push(data)),
        },
      }),
    ),
  };
  const items = {
    findActive: jest.fn(
      async (id: string) =>
        ({ cable, ont, clip })[id as 'cable' | 'ont' | 'clip'],
    ),
  };
  const snapshots = {
    get: jest.fn().mockResolvedValue({
      sr_number: 'SR-100',
      department: 'FTTH',
      service_type: 'Fault',
      area: "Male'",
    }),
  };
  const access = { canAccess: jest.fn().mockResolvedValue(true) };
  const audit = { log: jest.fn().mockResolvedValue(true) };
  const service = new TicketInventoryService(
    prisma as never,
    audit as never,
    items as never,
    snapshots as never,
    access as never,
  );
  return { service, created, audit };
}

const actor = { id: 'tech-1', crm_user_id: 'crm-1', role: ['Technician'] };
const dto = (
  lines: InventoryDeclarationDto['lines'],
  declaration: 'USED' | 'NONE_USED' = 'USED',
) =>
  ({
    declaration,
    lines,
    idempotency_key: 'abcdef1234',
  }) as InventoryDeclarationDto;

describe('TicketInventoryService', () => {
  it('posts decimal metres of cable and a serialized ONT', async () => {
    const { service, created } = build();
    await service.declare(
      'sr-1',
      actor,
      dto([
        { item_id: 'cable', quantity: 12.5 },
        { item_id: 'ont', quantity: 1, serial_number: ' hwtc 0001abcd ' },
      ]),
    );
    expect(created).toHaveLength(2);
    expect(String(created[0].quantity)).toBe('12.5');
    expect(created[0].uom).toBe('Meter');
    expect(created[1].serial_number).toBe('HWTC0001ABCD');
    expect(created[1].sr_number).toBe('SR-100');
  });

  it('rejects decimals on whole-unit items and more than 2 decimals', async () => {
    const { service } = build();
    await expect(
      service.declare('sr-1', actor, dto([{ item_id: 'clip', quantity: 1.5 }])),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.declare(
        'sr-1',
        actor,
        dto([{ item_id: 'cable', quantity: 1.255 }]),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a serial and quantity 1 for ONTs', async () => {
    const { service } = build();
    await expect(
      service.declare('sr-1', actor, dto([{ item_id: 'ont', quantity: 1 }])),
    ).rejects.toThrow(/serial/);
    await expect(
      service.declare(
        'sr-1',
        actor,
        dto([{ item_id: 'ont', quantity: 2, serial_number: 'HWTC0001' }]),
      ),
    ).rejects.toThrow(/exactly 1/);
  });

  it('rejects a serial already posted on another service request', async () => {
    const { service } = build({
      serial_number: 'HWTC0001',
      sr_number: 'SR-55',
      crm_ticket_id: 'sr-55',
    });
    await expect(
      service.declare(
        'sr-1',
        actor,
        dto([{ item_id: 'ont', quantity: 1, serial_number: 'HWTC0001' }]),
      ),
    ).rejects.toThrow(
      new ConflictException('Serial HWTC0001 is already recorded on SR SR-55.'),
    );
  });

  it('requires lines for "inventory used" and none for "no inventory used"', async () => {
    const { service } = build();
    await expect(service.declare('sr-1', actor, dto([]))).rejects.toThrow(
      /at least one item/,
    );
    await expect(
      service.declare(
        'sr-1',
        actor,
        dto([{ item_id: 'clip', quantity: 2 }], 'NONE_USED'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records the declaration in the audit trail with an idempotency key', async () => {
    const { service, audit } = build();
    await service.declare('sr-1', actor, dto([], 'NONE_USED'));
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'INVENTORY_DECLARED',
        idempotency_key: 'inv:sr-1:abcdef1234',
      }),
    );
  });

  it('computes effective quantity from adjustments and zero once reversed', () => {
    const line = {
      status: 'POSTED' as const,
      quantity: new Prisma.Decimal(12.5),
      adjustments: [{ quantity_delta: new Prisma.Decimal(-2.5) }],
    };
    expect(effectiveQuantity(line)).toBe(10);
    expect(effectiveQuantity({ ...line, status: 'REVERSED' })).toBe(0);
    expect(normalizeSerial(' ab 12 ')).toBe('AB12');
  });
});
