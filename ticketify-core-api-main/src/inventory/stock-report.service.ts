import { Injectable } from '@nestjs/common';
import { Prisma, SerialUnitStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { TechnicianStockService } from './technician-stock.service';
import {
  displayDate,
  parseDate,
  ReportColumn,
  round2,
  splitList,
} from './report-format';

export type StockReportQuery = {
  /** Empty = all time; in_hand is always the current balance. */
  from?: string;
  to?: string;
  technician_ids?: string;
  item_ids?: string;
  type?: string;
  status?: string;
  search?: string;
};

export type StockSummaryRow = {
  technician_user_id: string;
  technician_name: string;
  item_id: string;
  item_code: string;
  item_name: string;
  uom: string;
  serialized: boolean;
  issued: number;
  consumed: number;
  returned_good: number;
  returned_faulty: number;
  in_hand: number;
};

export type StockMovementRow = {
  id: string;
  created_at: Date;
  batch_id: string;
  type: 'Issue' | 'Return';
  technician_user_id: string;
  technician_name: string;
  item_code: string;
  item_name: string;
  quantity: number;
  uom: string;
  serial_number: string | null;
  condition: 'Good' | 'Faulty' | null;
  reference: string | null;
  notes: string | null;
  performed_by_name: string;
};

const MAX_ROWS = 10_000;
const MAX_SERIALS = 2_000;

const SUMMARY_COLUMNS: ReportColumn<StockSummaryRow>[] = [
  { header: 'Technician', value: (row) => row.technician_name },
  { header: 'Item code', value: (row) => row.item_code },
  { header: 'Item', value: (row) => row.item_name },
  { header: 'UOM', value: (row) => row.uom },
  { header: 'Issued', value: (row) => row.issued },
  { header: 'Consumed on tickets', value: (row) => row.consumed },
  { header: 'Returned (good)', value: (row) => row.returned_good },
  { header: 'Returned (faulty)', value: (row) => row.returned_faulty },
  { header: 'In hand now', value: (row) => row.in_hand },
];

const MOVEMENT_COLUMNS: ReportColumn<StockMovementRow>[] = [
  { header: 'Date / time', value: (row) => displayDate(row.created_at) },
  { header: 'Type', value: (row) => row.type },
  { header: 'Technician', value: (row) => row.technician_name },
  { header: 'Item code', value: (row) => row.item_code },
  { header: 'Item', value: (row) => row.item_name },
  { header: 'Quantity', value: (row) => row.quantity },
  { header: 'UOM', value: (row) => row.uom },
  { header: 'Serial number', value: (row) => row.serial_number },
  { header: 'Condition', value: (row) => row.condition },
  { header: 'Reference', value: (row) => row.reference },
  { header: 'Notes', value: (row) => row.notes },
  { header: 'Recorded by', value: (row) => row.performed_by_name },
];

@Injectable()
export class StockReportService {
  readonly summaryColumns = SUMMARY_COLUMNS;
  readonly movementColumns = MOVEMENT_COLUMNS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: TechnicianStockService,
  ) {}

  async summary(query: StockReportQuery) {
    const technicianIds = splitList(query.technician_ids);
    const itemIds = splitList(query.item_ids);
    const from = parseDate(query.from);
    const to = parseDate(query.to, true);
    const [period, current] = await Promise.all([
      from || to ? this.stock.totals({ technicianIds, itemIds, from, to }) : null,
      this.stock.totals({ technicianIds, itemIds }),
    ]);
    const balances = new Map(current.map((entry) => [`${entry.technician_user_id}|${entry.item_id}`, entry]));
    const figures = new Map((period ?? current).map((entry) => [`${entry.technician_user_id}|${entry.item_id}`, entry]));
    const keys = [...new Set([...balances.keys(), ...figures.keys()])];

    const [names, items] = await Promise.all([
      this.userNames(keys.map((key) => key.split('|')[0])),
      this.prisma.inventoryItem.findMany({
        where: { id: { in: [...new Set(keys.map((key) => key.split('|')[1]))] } },
        select: { id: true, code: true, name: true, consumption_uom: true, serialized: true },
      }),
    ]);
    const itemById = new Map(items.map((item) => [item.id, item]));

    const rows: StockSummaryRow[] = keys
      .map((key) => {
        const [technicianId, itemId] = key.split('|');
        const item = itemById.get(itemId);
        const shown = figures.get(key);
        return {
          technician_user_id: technicianId,
          technician_name: names.get(technicianId) ?? 'Unknown user',
          item_id: itemId,
          item_code: item?.code ?? '',
          item_name: item?.name ?? 'Unknown item',
          uom: item?.consumption_uom ?? '',
          serialized: Boolean(item?.serialized),
          issued: shown?.issued ?? 0,
          consumed: shown?.consumed ?? 0,
          returned_good: shown?.returned_good ?? 0,
          returned_faulty: shown?.returned_faulty ?? 0,
          in_hand: balances.get(key)?.in_hand ?? 0,
        };
      })
      .filter((row) => row.issued || row.consumed || row.returned_good || row.returned_faulty || row.in_hand)
      .sort(
        (a, b) =>
          a.technician_name.localeCompare(b.technician_name) || a.item_name.localeCompare(b.item_name),
      );

    const byItem = new Map<
      string,
      Omit<StockSummaryRow, 'technician_user_id' | 'technician_name'> & { technicians: number }
    >();
    for (const row of rows) {
      const entry = byItem.get(row.item_id) ?? {
        item_id: row.item_id,
        item_code: row.item_code,
        item_name: row.item_name,
        uom: row.uom,
        serialized: row.serialized,
        issued: 0,
        consumed: 0,
        returned_good: 0,
        returned_faulty: 0,
        in_hand: 0,
        technicians: 0,
      };
      entry.issued = round2(entry.issued + row.issued);
      entry.consumed = round2(entry.consumed + row.consumed);
      entry.returned_good = round2(entry.returned_good + row.returned_good);
      entry.returned_faulty = round2(entry.returned_faulty + row.returned_faulty);
      entry.in_hand = round2(entry.in_hand + row.in_hand);
      if (row.in_hand > 0) entry.technicians += 1;
      byItem.set(row.item_id, entry);
    }

    return {
      period: { from, to },
      rows,
      by_item: [...byItem.values()].sort((a, b) => a.item_name.localeCompare(b.item_name)),
      totals: {
        technicians: new Set(rows.map((row) => row.technician_user_id)).size,
        technicians_holding: new Set(rows.filter((row) => row.in_hand > 0).map((row) => row.technician_user_id)).size,
        items: byItem.size,
        overdrawn: rows.filter((row) => row.in_hand < 0).length,
      },
    };
  }

  async movements(query: StockReportQuery): Promise<StockMovementRow[]> {
    const where: Prisma.TechnicianStockMovementWhereInput[] = [];
    const from = parseDate(query.from);
    const to = parseDate(query.to, true);
    if (from || to) where.push({ created_at: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
    const technicianIds = splitList(query.technician_ids);
    if (technicianIds.length) where.push({ technician_user_id: { in: technicianIds } });
    const itemIds = splitList(query.item_ids);
    if (itemIds.length) where.push({ item_id: { in: itemIds } });
    const type = query.type?.trim().toUpperCase();
    if (type === 'ISSUE' || type === 'RETURN') where.push({ type: type as StockMovementType });
    const search = query.search?.trim();
    if (search) {
      where.push({
        OR: [
          { serial_number: { contains: search, mode: 'insensitive' } },
          { reference: { contains: search, mode: 'insensitive' } },
          { item_name: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    const movements = await this.prisma.technicianStockMovement.findMany({
      where: { AND: where },
      orderBy: { created_at: 'desc' },
      take: MAX_ROWS,
      include: { item: { select: { code: true } } },
    });
    const names = await this.userNames(
      movements.flatMap((movement) => [movement.technician_user_id, movement.performed_by_user_id]),
    );
    return movements.map((movement) => ({
      id: movement.id,
      created_at: movement.created_at,
      batch_id: movement.batch_id,
      type: movement.type === 'ISSUE' ? 'Issue' : 'Return',
      technician_user_id: movement.technician_user_id,
      technician_name: names.get(movement.technician_user_id) ?? 'Unknown user',
      item_code: movement.item.code,
      item_name: movement.item_name,
      quantity: Number(movement.quantity),
      uom: movement.uom,
      serial_number: movement.serial_number,
      condition: movement.condition === 'FAULTY' ? 'Faulty' : movement.condition === 'GOOD' ? 'Good' : null,
      reference: movement.reference,
      notes: movement.notes,
      performed_by_name: names.get(movement.performed_by_user_id) ?? 'Unknown user',
    }));
  }

  /** Where every serialized unit is: with whom, or on which SR it was installed. */
  async serials(query: StockReportQuery) {
    const where: Prisma.SerialUnitWhereInput[] = [];
    const search = query.search?.trim();
    if (search) where.push({ serial_number: { contains: search, mode: 'insensitive' } });
    const status = query.status?.trim().toUpperCase();
    if (status && status in SerialUnitStatus) where.push({ status: status as SerialUnitStatus });
    const technicianIds = splitList(query.technician_ids);
    if (technicianIds.length) where.push({ technician_user_id: { in: technicianIds } });
    const itemIds = splitList(query.item_ids);
    if (itemIds.length) where.push({ item_id: { in: itemIds } });

    const units = await this.prisma.serialUnit.findMany({
      where: { AND: where },
      orderBy: { updated_at: 'desc' },
      take: MAX_SERIALS,
      include: { item: { select: { code: true, name: true } } },
    });
    const consumptionIds = units.map((unit) => unit.consumption_id).filter((id): id is string => Boolean(id));
    const [consumptions, lastIssue] = await Promise.all([
      this.prisma.ticketInventoryConsumption.findMany({
        where: { id: { in: consumptionIds } },
        select: { id: true, crm_ticket_id: true, sr_number: true, technician_user_id: true, posted_at: true },
      }),
      this.prisma.technicianStockMovement.findMany({
        where: { type: 'ISSUE', serial_number: { in: units.map((unit) => unit.serial_number) } },
        orderBy: { created_at: 'desc' },
        distinct: ['serial_number'],
        select: { serial_number: true, technician_user_id: true },
      }),
    ]);
    const consumptionById = new Map(consumptions.map((line) => [line.id, line]));
    const issuedTo = new Map(lastIssue.map((movement) => [movement.serial_number, movement.technician_user_id]));
    const names = await this.userNames([
      ...units.map((unit) => unit.technician_user_id ?? ''),
      ...consumptions.map((line) => line.technician_user_id),
      ...lastIssue.map((movement) => movement.technician_user_id),
    ]);
    return units.map((unit) => {
      const consumption = unit.consumption_id ? consumptionById.get(unit.consumption_id) : undefined;
      const lastHolder = issuedTo.get(unit.serial_number);
      return {
        serial_number: unit.serial_number,
        item_code: unit.item.code,
        item_name: unit.item.name,
        status: unit.status,
        technician_name: unit.technician_user_id ? names.get(unit.technician_user_id) ?? 'Unknown user' : null,
        last_issued_to: lastHolder ? names.get(lastHolder) ?? 'Unknown user' : null,
        crm_ticket_id: consumption?.crm_ticket_id ?? null,
        sr_number: consumption?.sr_number ?? null,
        installed_at: consumption?.posted_at ?? null,
        issued_at: unit.issued_at,
        updated_at: unit.updated_at,
      };
    });
  }

  private async userNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, email: true },
    });
    return new Map(users.map((user) => [user.id, user.name?.trim() || user.email]));
  }
}
