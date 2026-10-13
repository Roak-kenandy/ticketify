import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryItem,
  Prisma,
  SerialUnitStatus,
  StockMovementType,
  StockReturnCondition,
} from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import { hasAnyRole, INVENTORY_ROLES } from 'src/auth/ops-roles';
import { InventoryItemsService } from './inventory-items.service';
import { normalizeSerial, SERIAL_PATTERN } from './serial';
import { round2 } from './report-format';
import {
  StockIssueDto,
  StockLineDto,
  StockReturnDto,
  StockReturnLineDto,
} from './dto/stock.dto';

type Db = PrismaService | Prisma.TransactionClient;

export type StockActor = { id: string; role?: unknown };

export type StockTotals = {
  technician_user_id: string;
  item_id: string;
  issued: number;
  returned_good: number;
  returned_faulty: number;
  consumed: number;
  in_hand: number;
};

export type StockFilter = {
  technicianIds?: string[];
  itemIds?: string[];
  from?: Date | null;
  to?: Date | null;
};

/** A ticket line about to be drawn from the technician's stock. */
export type StockDraw = {
  item: Pick<InventoryItem, 'id' | 'name' | 'serialized' | 'consumption_uom'>;
  quantity: number;
  serial: string | null;
};

type PreparedLine = {
  item: InventoryItem;
  quantity: number;
  serials: string[];
  condition?: StockReturnCondition;
};

/** Only technicians hold issued stock; managers record items unrestricted. */
const STOCK_HOLDER_ROLES = ['Technician'];

const ITEM_VIEW_SELECT = {
  id: true,
  code: true,
  name: true,
  category: true,
  consumption_uom: true,
  serialized: true,
  allow_decimal: true,
  remarks_required: true,
  active: true,
} as const;

const SERIAL_STATUS_TEXT: Record<SerialUnitStatus, string> = {
  WITH_TECHNICIAN: 'is already issued to a technician',
  CONSUMED: 'is already installed on a service request',
  RETURNED: 'is in the store',
  FAULTY: 'was returned as faulty',
};

@Injectable()
export class TechnicianStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IntegrationAuditService,
    private readonly items: InventoryItemsService,
  ) {}

  /** Active users who can hold stock (technicians and field-capable managers). */
  async technicians() {
    const users = await this.prisma.user.findMany({
      where: { is_active: true },
      select: { id: true, name: true, email: true, role: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    return users
      .filter((user) => hasAnyRole(STOCK_HOLDER_ROLES, user.role?.name))
      .map((user) => ({
        id: user.id,
        name: user.name?.trim() || user.email,
        email: user.email,
        role: user.role?.name ?? null,
      }));
  }

  /**
   * Issued / returned / consumed per technician and item. Without a period the
   * figures are all-time, so in_hand = issued - returned - consumed.
   */
  async totals(filter: StockFilter = {}, db: Db = this.prisma): Promise<StockTotals[]> {
    const createdAt = dateRange(filter.from, filter.to);
    const movements = await db.technicianStockMovement.groupBy({
      by: ['technician_user_id', 'item_id', 'type', 'condition'],
      where: {
        ...(filter.technicianIds?.length ? { technician_user_id: { in: filter.technicianIds } } : {}),
        ...(filter.itemIds?.length ? { item_id: { in: filter.itemIds } } : {}),
        ...(createdAt ? { created_at: createdAt } : {}),
      },
      _sum: { quantity: true },
    });

    const conditions: Prisma.Sql[] = [Prisma.sql`c.stock_tracked = true`, Prisma.sql`c.status = 'POSTED'`];
    if (filter.technicianIds?.length) {
      conditions.push(Prisma.sql`c.technician_user_id IN (${Prisma.join(filter.technicianIds)})`);
    }
    if (filter.itemIds?.length) {
      conditions.push(Prisma.sql`c.item_id IN (${Prisma.join(filter.itemIds)})`);
    }
    if (filter.from) conditions.push(Prisma.sql`c.posted_at >= ${filter.from}`);
    if (filter.to) conditions.push(Prisma.sql`c.posted_at <= ${filter.to}`);
    const consumed = await db.$queryRaw<{ technician_user_id: string; item_id: string; consumed: number }[]>`
      SELECT c.technician_user_id, c.item_id,
             COALESCE(SUM(c.quantity + COALESCE(a.delta, 0)), 0)::float8 AS consumed
      FROM ticket_inventory_consumptions c
      LEFT JOIN (
        SELECT consumption_id, SUM(quantity_delta) AS delta
        FROM inventory_adjustments GROUP BY consumption_id
      ) a ON a.consumption_id = c.id
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY c.technician_user_id, c.item_id`;

    const rows = new Map<string, StockTotals>();
    const row = (technicianId: string, itemId: string) => {
      const key = `${technicianId}|${itemId}`;
      let entry = rows.get(key);
      if (!entry) {
        entry = {
          technician_user_id: technicianId,
          item_id: itemId,
          issued: 0,
          returned_good: 0,
          returned_faulty: 0,
          consumed: 0,
          in_hand: 0,
        };
        rows.set(key, entry);
      }
      return entry;
    };
    for (const movement of movements) {
      const entry = row(movement.technician_user_id, movement.item_id);
      const quantity = Number(movement._sum.quantity ?? 0);
      if (movement.type === 'ISSUE') entry.issued = round2(entry.issued + quantity);
      else if (movement.condition === 'FAULTY') entry.returned_faulty = round2(entry.returned_faulty + quantity);
      else entry.returned_good = round2(entry.returned_good + quantity);
    }
    for (const line of consumed) {
      row(line.technician_user_id, line.item_id).consumed = round2(Number(line.consumed));
    }
    for (const entry of rows.values()) {
      entry.in_hand = round2(entry.issued - entry.returned_good - entry.returned_faulty - entry.consumed);
    }
    return [...rows.values()];
  }

  /** What a technician holds right now; the field app only offers these items. */
  async mine(actor: StockActor) {
    const [totals, units] = await Promise.all([
      this.totals({ technicianIds: [actor.id] }),
      this.prisma.serialUnit.findMany({
        where: { technician_user_id: actor.id, status: 'WITH_TECHNICIAN' },
        orderBy: { issued_at: 'asc' },
        select: { serial_number: true, item_id: true, issued_at: true },
      }),
    ]);
    const held = totals.filter((entry) => entry.in_hand > 0);
    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: held.map((entry) => entry.item_id) } },
      select: ITEM_VIEW_SELECT,
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
    return {
      /** Inventory team and managers record from the full catalog. */
      restricted: !this.isInventoryTeam(actor),
      items: items.map((item) => {
        const entry = held.find((candidate) => candidate.item_id === item.id)!;
        return {
          item,
          issued: entry.issued,
          consumed: entry.consumed,
          returned: round2(entry.returned_good + entry.returned_faulty),
          in_hand: entry.in_hand,
          serials: units
            .filter((unit) => unit.item_id === item.id)
            .map((unit) => ({ serial_number: unit.serial_number, issued_at: unit.issued_at })),
        };
      }),
    };
  }

  async issue(actor: StockActor, dto: StockIssueDto) {
    const technician = await this.findTechnician(dto.technician_user_id);
    const batchId = `iss:${dto.idempotency_key}`;
    if (await this.batchExists(batchId)) {
      return this.batch(batchId);
    }
    const lines = await this.prepare(dto.lines);
    const serials = lines.flatMap((line) => line.serials);

    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, technician.id);
      if (serials.length) {
        const [existing, installed] = await Promise.all([
          tx.serialUnit.findMany({ where: { serial_number: { in: serials } } }),
          tx.ticketInventoryConsumption.findFirst({
            where: {
              status: 'POSTED',
              OR: serials.map((serial) => ({ serial_number: { equals: serial, mode: 'insensitive' as const } })),
            },
            select: { serial_number: true, sr_number: true, crm_ticket_id: true },
          }),
        ]);
        if (installed) {
          throw new ConflictException(
            `Serial ${installed.serial_number} is already installed on SR ${installed.sr_number ?? installed.crm_ticket_id}.`,
          );
        }
        for (const unit of existing) {
          const line = lines.find((candidate) => candidate.serials.includes(unit.serial_number))!;
          if (unit.status !== 'RETURNED') {
            throw new ConflictException(`Serial ${unit.serial_number} ${SERIAL_STATUS_TEXT[unit.status]}.`);
          }
          if (unit.item_id !== line.item.id) {
            throw new ConflictException(`Serial ${unit.serial_number} belongs to a different item.`);
          }
        }
      }

      for (const line of lines) {
        const base = {
          batch_id: batchId,
          type: StockMovementType.ISSUE,
          technician_user_id: technician.id,
          item_id: line.item.id,
          item_name: line.item.name,
          uom: line.item.consumption_uom,
          reference: dto.reference?.trim() || null,
          notes: dto.notes?.trim() || null,
          performed_by_user_id: actor.id,
        };
        if (line.item.serialized) {
          await tx.technicianStockMovement.createMany({
            data: line.serials.map((serial) => ({ ...base, quantity: new Prisma.Decimal(1), serial_number: serial })),
          });
          for (const serial of line.serials) {
            await tx.serialUnit.upsert({
              where: { serial_number: serial },
              create: {
                serial_number: serial,
                item_id: line.item.id,
                status: 'WITH_TECHNICIAN',
                technician_user_id: technician.id,
              },
              update: {
                status: 'WITH_TECHNICIAN',
                technician_user_id: technician.id,
                consumption_id: null,
                issued_at: new Date(),
              },
            });
          }
        } else {
          await tx.technicianStockMovement.create({
            data: { ...base, quantity: new Prisma.Decimal(line.quantity) },
          });
        }
      }
    });

    await this.audit.log({
      entity_type: 'technician_stock',
      entity_id: technician.id,
      action: 'STOCK_ISSUED',
      actor_user_id: actor.id,
      new_state: this.auditLines(lines, dto.reference),
      idempotency_key: batchId,
    });
    return this.batch(batchId);
  }

  async returnStock(actor: StockActor, dto: StockReturnDto) {
    const technician = await this.findTechnician(dto.technician_user_id);
    const batchId = `ret:${dto.idempotency_key}`;
    if (await this.batchExists(batchId)) {
      return this.batch(batchId);
    }
    const lines = await this.prepare(dto.lines);

    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, technician.id);
      const bulk = lines.filter((line) => !line.item.serialized);
      if (bulk.length) {
        const totals = await this.totals(
          { technicianIds: [technician.id], itemIds: bulk.map((line) => line.item.id) },
          tx,
        );
        const requested = new Map<string, number>();
        for (const line of bulk) {
          requested.set(line.item.id, round2((requested.get(line.item.id) ?? 0) + line.quantity));
        }
        for (const [itemId, quantity] of requested) {
          const line = bulk.find((candidate) => candidate.item.id === itemId)!;
          const inHand = totals.find((entry) => entry.item_id === itemId)?.in_hand ?? 0;
          if (quantity > inHand) {
            throw new BadRequestException(
              `${line.item.name}: ${technician.name} only holds ${inHand} ${line.item.consumption_uom}.`,
            );
          }
        }
      }
      const serials = lines.flatMap((line) => line.serials);
      if (serials.length) {
        const units = await tx.serialUnit.findMany({ where: { serial_number: { in: serials } } });
        for (const serial of serials) {
          const unit = units.find((candidate) => candidate.serial_number === serial);
          if (!unit || unit.status !== 'WITH_TECHNICIAN' || unit.technician_user_id !== technician.id) {
            throw new BadRequestException(`Serial ${serial} is not held by ${technician.name}.`);
          }
        }
      }

      for (const line of lines) {
        const base = {
          batch_id: batchId,
          type: StockMovementType.RETURN,
          technician_user_id: technician.id,
          item_id: line.item.id,
          item_name: line.item.name,
          uom: line.item.consumption_uom,
          condition: line.condition,
          reference: dto.reference?.trim() || null,
          notes: dto.notes?.trim() || null,
          performed_by_user_id: actor.id,
        };
        if (line.item.serialized) {
          await tx.technicianStockMovement.createMany({
            data: line.serials.map((serial) => ({ ...base, quantity: new Prisma.Decimal(1), serial_number: serial })),
          });
          await tx.serialUnit.updateMany({
            where: { serial_number: { in: line.serials } },
            data: {
              status: line.condition === 'FAULTY' ? 'FAULTY' : 'RETURNED',
              technician_user_id: null,
            },
          });
        } else {
          await tx.technicianStockMovement.create({
            data: { ...base, quantity: new Prisma.Decimal(line.quantity) },
          });
        }
      }
    });

    await this.audit.log({
      entity_type: 'technician_stock',
      entity_id: technician.id,
      action: 'STOCK_RETURNED',
      actor_user_id: actor.id,
      new_state: this.auditLines(lines, dto.reference),
      idempotency_key: batchId,
    });
    return this.batch(batchId);
  }

  /**
   * Called inside the ticket-posting transaction: the technician may only record
   * what the inventory team issued to them and they still hold.
   */
  async assertCanDraw(tx: Prisma.TransactionClient, technicianId: string, draws: StockDraw[]) {
    await this.lock(tx, technicianId);
    const bulk = draws.filter((draw) => !draw.item.serialized);
    if (bulk.length) {
      const totals = await this.totals(
        { technicianIds: [technicianId], itemIds: [...new Set(bulk.map((draw) => draw.item.id))] },
        tx,
      );
      const requested = new Map<string, number>();
      for (const draw of bulk) {
        requested.set(draw.item.id, round2((requested.get(draw.item.id) ?? 0) + draw.quantity));
      }
      for (const [itemId, quantity] of requested) {
        const draw = bulk.find((candidate) => candidate.item.id === itemId)!;
        const inHand = Math.max(0, totals.find((entry) => entry.item_id === itemId)?.in_hand ?? 0);
        if (quantity > inHand) {
          throw new BadRequestException(
            inHand > 0
              ? `${draw.item.name}: you only have ${inHand} ${draw.item.consumption_uom} issued. Ask the inventory team for more.`
              : `${draw.item.name} has not been issued to you. Ask the inventory team to issue it first.`,
          );
        }
      }
    }
    const serialDraws = draws.filter((draw) => draw.item.serialized && draw.serial);
    if (serialDraws.length) {
      const units = await tx.serialUnit.findMany({
        where: { serial_number: { in: serialDraws.map((draw) => draw.serial!) } },
      });
      for (const draw of serialDraws) {
        const unit = units.find((candidate) => candidate.serial_number === draw.serial);
        if (!unit || unit.status !== 'WITH_TECHNICIAN' || unit.technician_user_id !== technicianId) {
          throw new BadRequestException(
            `Serial ${draw.serial} is not issued to you. Pick one of your issued ${draw.item.name} serials, or ask the inventory team to issue it.`,
          );
        }
        if (unit.item_id !== draw.item.id) {
          throw new BadRequestException(`Serial ${draw.serial} is not a ${draw.item.name}.`);
        }
      }
    }
  }

  /** True when the serial is issued to this technician and not yet installed. */
  async holdsSerial(technicianId: string, serial: string): Promise<boolean> {
    const unit = await this.prisma.serialUnit.findUnique({ where: { serial_number: serial } });
    return unit?.status === 'WITH_TECHNICIAN' && unit.technician_user_id === technicianId;
  }

  markConsumed(tx: Prisma.TransactionClient, serial: string, consumptionId: string) {
    return tx.serialUnit.update({
      where: { serial_number: serial },
      data: { status: 'CONSUMED', consumption_id: consumptionId },
    });
  }

  /** A reversed ticket line puts the serial back in the technician's hands. */
  releaseConsumption(tx: Prisma.TransactionClient, consumptionId: string) {
    return tx.serialUnit.updateMany({
      where: { consumption_id: consumptionId, status: 'CONSUMED' },
      data: { status: 'WITH_TECHNICIAN', consumption_id: null },
    });
  }

  isInventoryTeam(actor: StockActor) {
    return hasAnyRole(INVENTORY_ROLES, actor.role);
  }

  async batch(batchId: string) {
    const movements = await this.prisma.technicianStockMovement.findMany({
      where: { batch_id: batchId },
      orderBy: { created_at: 'asc' },
    });
    if (!movements.length) {
      throw new NotFoundException('Stock slip not found');
    }
    return {
      batch_id: batchId,
      type: movements[0].type,
      technician_user_id: movements[0].technician_user_id,
      created_at: movements[0].created_at,
      lines: movements.map((movement) => ({
        item_id: movement.item_id,
        item_name: movement.item_name,
        quantity: Number(movement.quantity),
        uom: movement.uom,
        serial_number: movement.serial_number,
        condition: movement.condition,
      })),
    };
  }

  private async prepare(lines: (StockLineDto | StockReturnLineDto)[]): Promise<PreparedLine[]> {
    const prepared: PreparedLine[] = [];
    const seenSerials = new Set<string>();
    for (const line of lines) {
      const item = await this.items.findActive(line.item_id);
      const condition = 'condition' in line ? line.condition : undefined;
      if (item.serialized) {
        const serials = (line.serial_numbers ?? []).map((value) => normalizeSerial(value)).filter(
          (value): value is string => Boolean(value),
        );
        if (!serials.length) {
          throw new BadRequestException(`${item.name}: enter the serial number of every unit.`);
        }
        for (const serial of serials) {
          if (!SERIAL_PATTERN.test(serial)) {
            throw new BadRequestException(`${item.name}: "${serial}" is not a valid serial number.`);
          }
          if (seenSerials.has(serial)) {
            throw new BadRequestException(`Serial ${serial} is listed twice.`);
          }
          seenSerials.add(serial);
        }
        prepared.push({ item, quantity: serials.length, serials, condition });
        continue;
      }
      if (line.serial_numbers?.length) {
        throw new BadRequestException(`${item.name} is not tracked by serial number.`);
      }
      const factor = line.unit === 'STOCK' ? Number(item.conversion_factor) || 1 : 1;
      const quantity = round2((line.quantity ?? 0) * factor);
      if (!(quantity > 0)) {
        throw new BadRequestException(`${item.name}: enter a quantity greater than zero.`);
      }
      if (!item.allow_decimal && !Number.isInteger(quantity)) {
        throw new BadRequestException(`${item.name} is counted in whole ${item.consumption_uom.toLowerCase()}s.`);
      }
      prepared.push({ item, quantity, serials: [], condition });
    }
    return prepared;
  }

  private async findTechnician(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, is_active: true, role: { select: { name: true } } },
    });
    if (!user || !user.is_active || !hasAnyRole(STOCK_HOLDER_ROLES, user.role?.name)) {
      throw new NotFoundException('Technician not found or inactive');
    }
    return { id: user.id, name: user.name?.trim() || user.email };
  }

  private async batchExists(batchId: string) {
    const found = await this.prisma.technicianStockMovement.findFirst({
      where: { batch_id: batchId },
      select: { id: true },
    });
    return Boolean(found);
  }

  /** Serializes stock changes per technician so two posts cannot overdraw. */
  private async lock(tx: Prisma.TransactionClient, technicianId: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`stock:${technicianId}`}))::text`;
  }

  private auditLines(lines: PreparedLine[], reference?: string) {
    return {
      reference: reference?.trim() || null,
      lines: lines.map((line) => ({
        item_code: line.item.code,
        quantity: line.quantity,
        uom: line.item.consumption_uom,
        serial_numbers: line.serials,
        condition: line.condition ?? null,
      })),
    };
  }
}

function dateRange(from?: Date | null, to?: Date | null) {
  if (!from && !to) return null;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}