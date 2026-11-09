import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { hasAnyRole, INVENTORY_ROLES, SUPERVISOR_STOCK_ROLES } from 'src/auth/ops-roles';
import { InventoryItemsService } from './inventory-items.service';
import { normalizeSerial, SERIAL_PATTERN } from './serial';
import { round2 } from './report-format';
import {
  StockHandoverDto,
  StockIssueDto,
  StockLineDto,
  StockReturnDto,
  StockReturnLineDto,
} from './dto/stock.dto';

type Db = PrismaService | Prisma.TransactionClient;

export type StockActor = { id: string; role?: unknown };

export type HolderKind = 'SUPERVISOR' | 'TECHNICIAN';

type Holder = { id: string; name: string; kind: HolderKind };

export type StockTotals = {
  technician_user_id: string;
  item_id: string;
  /** Received from the store, or from a supervisor for technicians. */
  issued: number;
  returned_good: number;
  returned_faulty: number;
  /** Supervisors: handed to technicians, and good items technicians gave back. */
  handed_out: number;
  taken_back: number;
  consumed: number;
  in_hand: number;
  last_issued_at: Date | null;
  last_returned_at: Date | null;
  last_used_at: Date | null;
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

type MovementBase = {
  batch_id: string;
  type: StockMovementType;
  technician_user_id: string;
  counterparty_user_id: string | null;
  condition?: StockReturnCondition;
  reference: string | null;
  notes: string | null;
  performed_by_user_id: string;
};

const HOLDER_ROLES: Record<HolderKind, string[]> = {
  SUPERVISOR: SUPERVISOR_STOCK_ROLES,
  TECHNICIAN: ['Technician'],
};

const HELD_STATUS: Record<HolderKind, SerialUnitStatus> = {
  SUPERVISOR: 'WITH_SUPERVISOR',
  TECHNICIAN: 'WITH_TECHNICIAN',
};

const HELD_STATUSES: SerialUnitStatus[] = ['WITH_SUPERVISOR', 'WITH_TECHNICIAN'];

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
  WITH_SUPERVISOR: 'is already with a supervisor. Use "Record return" to take it back first',
  WITH_TECHNICIAN: 'is already with a technician. Use "Record return" to take it back first',
  CONSUMED: 'is already installed on a service request',
  RETURNED: 'is in the store',
  FAULTY: 'was returned as faulty',
};

export function holderKind(role: unknown): HolderKind | null {
  if (hasAnyRole(HOLDER_ROLES.SUPERVISOR, role)) return 'SUPERVISOR';
  if (hasAnyRole(HOLDER_ROLES.TECHNICIAN, role)) return 'TECHNICIAN';
  return null;
}

@Injectable()
export class TechnicianStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IntegrationAuditService,
    private readonly items: InventoryItemsService,
  ) {}

  /** Active supervisors and technicians: everyone who can hold stock. */
  async technicians() {
    const users = await this.prisma.user.findMany({
      where: { is_active: true },
      select: { id: true, name: true, email: true, role: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    return users.flatMap((user) => {
      const kind = holderKind(user.role?.name);
      return kind
        ? [{ id: user.id, name: user.name?.trim() || user.email, email: user.email, role: user.role?.name ?? null, kind }]
        : [];
    });
  }

  /**
   * Received / handed out / returned / consumed per holder and item. Without a
   * period the figures are all-time, so in_hand is the current balance.
   */
  async totals(filter: StockFilter = {}, db: Db = this.prisma): Promise<StockTotals[]> {
    const createdAt = dateRange(filter.from, filter.to);
    const holderIds = filter.technicianIds?.length ? new Set(filter.technicianIds) : null;
    const movements = await db.technicianStockMovement.groupBy({
      by: ['technician_user_id', 'counterparty_user_id', 'item_id', 'type', 'condition'],
      where: {
        ...(holderIds
          ? {
              OR: [
                { technician_user_id: { in: [...holderIds] } },
                { counterparty_user_id: { in: [...holderIds] } },
              ],
            }
          : {}),
        ...(filter.itemIds?.length ? { item_id: { in: filter.itemIds } } : {}),
        ...(createdAt ? { created_at: createdAt } : {}),
      },
      _sum: { quantity: true },
      _max: { created_at: true },
    });

    const conditions: Prisma.Sql[] = [Prisma.sql`c.stock_tracked = true`, Prisma.sql`c.status = 'POSTED'`];
    if (holderIds) {
      conditions.push(Prisma.sql`c.technician_user_id IN (${Prisma.join([...holderIds])})`);
    }
    if (filter.itemIds?.length) {
      conditions.push(Prisma.sql`c.item_id IN (${Prisma.join(filter.itemIds)})`);
    }
    if (filter.from) conditions.push(Prisma.sql`c.posted_at >= ${filter.from}`);
    if (filter.to) conditions.push(Prisma.sql`c.posted_at <= ${filter.to}`);
    const consumed = await db.$queryRaw<
      { technician_user_id: string; item_id: string; consumed: number; last_used_at: Date | null }[]
    >`
      SELECT c.technician_user_id, c.item_id,
             COALESCE(SUM(c.quantity + COALESCE(a.delta, 0)), 0)::float8 AS consumed,
             MAX(c.posted_at) AS last_used_at
      FROM ticket_inventory_consumptions c
      LEFT JOIN (
        SELECT consumption_id, SUM(quantity_delta) AS delta
        FROM inventory_adjustments GROUP BY consumption_id
      ) a ON a.consumption_id = c.id
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY c.technician_user_id, c.item_id`;

    const rows = new Map<string, StockTotals>();
    const row = (holderId: string, itemId: string) => {
      const key = `${holderId}|${itemId}`;
      let entry = rows.get(key);
      if (!entry) {
        entry = {
          technician_user_id: holderId,
          item_id: itemId,
          issued: 0,
          returned_good: 0,
          returned_faulty: 0,
          handed_out: 0,
          taken_back: 0,
          consumed: 0,
          in_hand: 0,
          last_issued_at: null,
          last_returned_at: null,
          last_used_at: null,
        };
        rows.set(key, entry);
      }
      return entry;
    };
    const tracked = (id: string | null | undefined): id is string => Boolean(id) && (!holderIds || holderIds.has(id!));
    for (const movement of movements) {
      const quantity = Number(movement._sum.quantity ?? 0);
      const at = movement._max.created_at;
      if (tracked(movement.technician_user_id)) {
        const entry = row(movement.technician_user_id, movement.item_id);
        if (movement.type === 'ISSUE') {
          entry.issued = round2(entry.issued + quantity);
          entry.last_issued_at = latest(entry.last_issued_at, at);
        } else {
          if (movement.condition === 'FAULTY') entry.returned_faulty = round2(entry.returned_faulty + quantity);
          else entry.returned_good = round2(entry.returned_good + quantity);
          entry.last_returned_at = latest(entry.last_returned_at, at);
        }
      }
      if (tracked(movement.counterparty_user_id)) {
        const entry = row(movement.counterparty_user_id, movement.item_id);
        if (movement.type === 'ISSUE') entry.handed_out = round2(entry.handed_out + quantity);
        else entry.taken_back = round2(entry.taken_back + quantity);
      }
    }
    for (const line of consumed) {
      const entry = row(line.technician_user_id, line.item_id);
      entry.consumed = round2(Number(line.consumed));
      entry.last_used_at = line.last_used_at;
    }
    for (const entry of rows.values()) {
      entry.in_hand = round2(
        entry.issued + entry.taken_back - entry.handed_out - entry.returned_good - entry.returned_faulty - entry.consumed,
      );
    }
    return [...rows.values()];
  }

  /** What the caller holds right now; the field app only offers these items. */
  async mine(actor: StockActor) {
    const [totals, units] = await Promise.all([
      this.totals({ technicianIds: [actor.id] }),
      this.prisma.serialUnit.findMany({
        where: { technician_user_id: actor.id, status: { in: HELD_STATUSES } },
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
      /** SUPERVISOR = hands stock out to technicians. */
      holder: holderKind(actor.role),
      /** Inventory team and managers record from the full catalog. */
      restricted: !this.isInventoryTeam(actor),
      items: items.map((item) => {
        const entry = held.find((candidate) => candidate.item_id === item.id)!;
        return {
          item,
          issued: entry.issued,
          consumed: entry.consumed,
          returned: round2(entry.returned_good + entry.returned_faulty),
          handed_out: entry.handed_out,
          taken_back: entry.taken_back,
          in_hand: entry.in_hand,
          serials: units
            .filter((unit) => unit.item_id === item.id)
            .map((unit) => ({ serial_number: unit.serial_number, issued_at: unit.issued_at })),
        };
      }),
    };
  }

  /** Store → supervisor. Optionally closes the supervisor's stock request. */
  async issue(actor: StockActor, dto: StockIssueDto) {
    const supervisor = await this.findHolder(dto.technician_user_id, 'SUPERVISOR');
    const batchId = `iss:${dto.idempotency_key}`;
    if (await this.batchExists(batchId)) {
      return this.batch(batchId);
    }
    const lines = await this.prepare(dto.lines);

    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, [supervisor.id]);
      if (dto.request_id) {
        const closed = await tx.stockRequest.updateMany({
          where: { id: dto.request_id, status: 'OPEN', requested_by_user_id: supervisor.id },
          data: { status: 'FULFILLED', fulfilled_batch_id: batchId, closed_by_user_id: actor.id, closed_at: new Date() },
        });
        if (!closed.count) {
          throw new ConflictException(`This request is no longer open, or was not raised by ${supervisor.name}.`);
        }
      }
      await this.assertInStore(tx, lines);
      await this.writeMovements(tx, this.base(actor, batchId, 'ISSUE', supervisor.id, null, dto), lines);
      for (const serial of lines.flatMap((line) => line.serials)) {
        const line = lines.find((candidate) => candidate.serials.includes(serial))!;
        await tx.serialUnit.upsert({
          where: { serial_number: serial },
          create: {
            serial_number: serial,
            item_id: line.item.id,
            status: HELD_STATUS.SUPERVISOR,
            technician_user_id: supervisor.id,
          },
          update: {
            status: HELD_STATUS.SUPERVISOR,
            technician_user_id: supervisor.id,
            consumption_id: null,
            issued_at: new Date(),
          },
        });
      }
    });

    await this.logSlip('STOCK_ISSUED', actor, supervisor.id, batchId, lines, dto.reference, dto.request_id);
    return this.batch(batchId);
  }

  /** Any holder → store (good or faulty). */
  async returnStock(actor: StockActor, dto: StockReturnDto) {
    const holder = await this.findHolder(dto.technician_user_id);
    const batchId = `ret:${dto.idempotency_key}`;
    if (await this.batchExists(batchId)) {
      return this.batch(batchId);
    }
    const lines = await this.prepare(dto.lines);

    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, [holder.id]);
      await this.assertHolds(tx, holder, lines, {
        holds: `${holder.name} only holds`,
        missing: `is not held by ${holder.name}`,
      });
      for (const line of lines) {
        await this.writeMovements(
          tx,
          { ...this.base(actor, batchId, 'RETURN', holder.id, null, dto), condition: line.condition },
          [line],
        );
        if (line.serials.length) {
          await tx.serialUnit.updateMany({
            where: { serial_number: { in: line.serials } },
            data: { status: line.condition === 'FAULTY' ? 'FAULTY' : 'RETURNED', technician_user_id: null },
          });
        }
      }
    });

    await this.logSlip('STOCK_RETURNED', actor, holder.id, batchId, lines, dto.reference);
    return this.batch(batchId);
  }

  /** Supervisor → technician, from the supervisor's own stock. */
  async handOut(actor: StockActor, dto: StockHandoverDto) {
    const supervisor = await this.actingSupervisor(actor);
    const technician = await this.findHolder(dto.technician_user_id, 'TECHNICIAN');
    const batchId = `hnd:${dto.idempotency_key}`;
    if (await this.batchExists(batchId)) {
      return this.batch(batchId);
    }
    const lines = await this.prepare(dto.lines);

    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, [supervisor.id, technician.id]);
      await this.assertHolds(tx, supervisor, lines, { holds: 'you only hold', missing: 'is not in your stock' });
      await this.writeMovements(tx, this.base(actor, batchId, 'ISSUE', technician.id, supervisor.id, dto), lines);
      const serials = lines.flatMap((line) => line.serials);
      if (serials.length) {
        await tx.serialUnit.updateMany({
          where: { serial_number: { in: serials } },
          data: { status: HELD_STATUS.TECHNICIAN, technician_user_id: technician.id, issued_at: new Date() },
        });
      }
    });

    await this.logSlip('STOCK_HANDED_OUT', actor, technician.id, batchId, lines, dto.reference);
    return this.batch(batchId);
  }

  /** Technician → supervisor: unused, good items go back into the supervisor's stock. */
  async takeBack(actor: StockActor, dto: StockHandoverDto) {
    const supervisor = await this.actingSupervisor(actor);
    const technician = await this.findHolder(dto.technician_user_id, 'TECHNICIAN');
    const batchId = `tkb:${dto.idempotency_key}`;
    if (await this.batchExists(batchId)) {
      return this.batch(batchId);
    }
    const lines = await this.prepare(dto.lines);

    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, [supervisor.id, technician.id]);
      await this.assertHolds(tx, technician, lines, {
        holds: `${technician.name} only holds`,
        missing: `is not held by ${technician.name}`,
      });
      await this.writeMovements(
        tx,
        { ...this.base(actor, batchId, 'RETURN', technician.id, supervisor.id, dto), condition: 'GOOD' },
        lines,
      );
      const serials = lines.flatMap((line) => line.serials);
      if (serials.length) {
        await tx.serialUnit.updateMany({
          where: { serial_number: { in: serials } },
          data: { status: HELD_STATUS.SUPERVISOR, technician_user_id: supervisor.id },
        });
      }
    });

    await this.logSlip('STOCK_TAKEN_BACK', actor, technician.id, batchId, lines, dto.reference);
    return this.batch(batchId);
  }

  /**
   * Called inside the ticket-posting transaction: the technician may only record
   * what they were handed and still hold.
   */
  async assertCanDraw(tx: Prisma.TransactionClient, technicianId: string, draws: StockDraw[]) {
    await this.lock(tx, [technicianId]);
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
              ? `${draw.item.name}: you only have ${inHand} ${draw.item.consumption_uom} issued. Ask your supervisor for more.`
              : `${draw.item.name} has not been issued to you. Ask your supervisor to hand it to you first.`,
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
            `Serial ${draw.serial} is not issued to you. Pick one of your issued ${draw.item.name} serials, or ask your supervisor to hand it to you.`,
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

  /** Whoever holds a serial right now (supervisor or technician, not yet installed). */
  async holderOf(tx: Prisma.TransactionClient, serial: string): Promise<string | null> {
    const unit = await tx.serialUnit.findUnique({
      where: { serial_number: serial },
      select: { status: true, technician_user_id: true },
    });
    return unit && HELD_STATUSES.includes(unit.status) ? unit.technician_user_id : null;
  }

  markConsumed(tx: Prisma.TransactionClient, serial: string, consumptionId: string) {
    return tx.serialUnit.update({
      where: { serial_number: serial },
      data: { status: 'CONSUMED', consumption_id: consumptionId },
    });
  }

  /** A reversed ticket line puts the serial back with whoever held it. */
  async releaseConsumption(tx: Prisma.TransactionClient, consumptionId: string) {
    const unit = await tx.serialUnit.findUnique({
      where: { consumption_id: consumptionId },
      select: { technician_user_id: true },
    });
    if (!unit) return;
    const holder = unit.technician_user_id
      ? await tx.user.findUnique({ where: { id: unit.technician_user_id }, select: { role: { select: { name: true } } } })
      : null;
    await tx.serialUnit.updateMany({
      where: { consumption_id: consumptionId, status: 'CONSUMED' },
      data: {
        status: holderKind(holder?.role?.name) === 'SUPERVISOR' ? HELD_STATUS.SUPERVISOR : HELD_STATUS.TECHNICIAN,
        consumption_id: null,
      },
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
      counterparty_user_id: movements[0].counterparty_user_id,
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

  private base(
    actor: StockActor,
    batchId: string,
    type: StockMovementType,
    holderId: string,
    counterpartyId: string | null,
    dto: { reference?: string; notes?: string },
  ): MovementBase {
    return {
      batch_id: batchId,
      type,
      technician_user_id: holderId,
      counterparty_user_id: counterpartyId,
      reference: dto.reference?.trim() || null,
      notes: dto.notes?.trim() || null,
      performed_by_user_id: actor.id,
    };
  }

  private async writeMovements(tx: Prisma.TransactionClient, base: MovementBase, lines: PreparedLine[]) {
    for (const line of lines) {
      const row = { ...base, item_id: line.item.id, item_name: line.item.name, uom: line.item.consumption_uom };
      if (line.item.serialized) {
        await tx.technicianStockMovement.createMany({
          data: line.serials.map((serial) => ({ ...row, quantity: new Prisma.Decimal(1), serial_number: serial })),
        });
      } else {
        await tx.technicianStockMovement.create({ data: { ...row, quantity: new Prisma.Decimal(line.quantity) } });
      }
    }
  }

  /** New serials, or serials back in the store in good condition. */
  private async assertInStore(tx: Prisma.TransactionClient, lines: PreparedLine[]) {
    const serials = lines.flatMap((line) => line.serials);
    if (!serials.length) return;
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

  /** The holder has every listed serial and enough of each bulk item. */
  private async assertHolds(
    tx: Prisma.TransactionClient,
    holder: Holder,
    lines: PreparedLine[],
    text: { holds: string; missing: string },
  ) {
    const bulk = lines.filter((line) => !line.item.serialized);
    if (bulk.length) {
      const totals = await this.totals(
        { technicianIds: [holder.id], itemIds: [...new Set(bulk.map((line) => line.item.id))] },
        tx,
      );
      const requested = new Map<string, number>();
      for (const line of bulk) {
        requested.set(line.item.id, round2((requested.get(line.item.id) ?? 0) + line.quantity));
      }
      for (const [itemId, quantity] of requested) {
        const line = bulk.find((candidate) => candidate.item.id === itemId)!;
        const inHand = Math.max(0, totals.find((entry) => entry.item_id === itemId)?.in_hand ?? 0);
        if (quantity > inHand) {
          throw new BadRequestException(`${line.item.name}: ${text.holds} ${inHand} ${line.item.consumption_uom}.`);
        }
      }
    }
    const serials = lines.flatMap((line) => line.serials);
    if (!serials.length) return;
    const units = await tx.serialUnit.findMany({ where: { serial_number: { in: serials } } });
    for (const serial of serials) {
      const unit = units.find((candidate) => candidate.serial_number === serial);
      if (!unit || !HELD_STATUSES.includes(unit.status) || unit.technician_user_id !== holder.id) {
        throw new BadRequestException(`Serial ${serial} ${text.missing}.`);
      }
      const line = lines.find((candidate) => candidate.serials.includes(serial))!;
      if (unit.item_id !== line.item.id) {
        throw new BadRequestException(`Serial ${serial} is not a ${line.item.name}.`);
      }
    }
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

  private async findHolder(id: string, kind?: HolderKind): Promise<Holder> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, is_active: true, role: { select: { name: true } } },
    });
    const found = user?.is_active ? holderKind(user.role?.name) : null;
    if (!user || !found || (kind && found !== kind)) {
      throw new NotFoundException(
        kind === 'SUPERVISOR'
          ? 'Supervisor not found or inactive. The store issues stock to supervisors, who hand it to technicians.'
          : kind === 'TECHNICIAN'
            ? 'Technician not found or inactive'
            : 'Supervisor or technician not found or inactive',
      );
    }
    return { id: user.id, name: user.name?.trim() || user.email, kind: found };
  }

  private async actingSupervisor(actor: StockActor): Promise<Holder> {
    if (holderKind(actor.role) !== 'SUPERVISOR') {
      throw new ForbiddenException('Only supervisors hand stock to technicians.');
    }
    return this.findHolder(actor.id, 'SUPERVISOR');
  }

  private async batchExists(batchId: string) {
    const found = await this.prisma.technicianStockMovement.findFirst({
      where: { batch_id: batchId },
      select: { id: true },
    });
    return Boolean(found);
  }

  /** Serializes stock changes per holder so two posts cannot overdraw; sorted to avoid deadlocks. */
  private async lock(tx: Prisma.TransactionClient, holderIds: string[]) {
    for (const id of [...new Set(holderIds)].sort()) {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`stock:${id}`}))::text`;
    }
  }

  private logSlip(
    action: string,
    actor: StockActor,
    holderId: string,
    batchId: string,
    lines: PreparedLine[],
    reference?: string,
    requestId?: string,
  ) {
    return this.audit.log({
      entity_type: 'technician_stock',
      entity_id: holderId,
      action,
      actor_user_id: actor.id,
      new_state: {
        reference: reference?.trim() || null,
        request_id: requestId ?? null,
        lines: lines.map((line) => ({
          item_code: line.item.code,
          quantity: line.quantity,
          uom: line.item.consumption_uom,
          serial_numbers: line.serials,
          condition: line.condition ?? null,
        })),
      },
      idempotency_key: batchId,
    });
  }
}

function dateRange(from?: Date | null, to?: Date | null) {
  if (!from && !to) return null;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}

function latest(current: Date | null, next: Date | null | undefined): Date | null {
  if (!next) return current;
  return !current || next > current ? next : current;
}
