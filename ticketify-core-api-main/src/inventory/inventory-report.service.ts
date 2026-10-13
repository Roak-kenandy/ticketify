import { Injectable } from '@nestjs/common';
import { Prisma, ProvisioningAction } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { ACTION_LABELS } from 'src/provisioning/provisioning-policy';
import { effectiveQuantity } from './ticket-inventory.service';

export type InventoryReportQuery = {
  from?: string;
  to?: string;
  technician_ids?: string;
  department?: string;
  item_ids?: string;
  service_type?: string;
  /** Lines on SRs where this INCA action succeeded, e.g. ONT_REPLACEMENT. */
  inca_action?: string;
  area?: string;
  sr?: string;
  status?: string;
};

export type InventoryReportRow = {
  id: string;
  posted_at: Date;
  crm_ticket_id: string;
  sr_number: string | null;
  technician_user_id: string;
  technician_name: string;
  department: string | null;
  item_id: string;
  item_code: string;
  item_name: string;
  quantity: number;
  original_quantity: number;
  uom: string;
  serial_number: string | null;
  service_type: string | null;
  /** Successful INCA actions on the SR, e.g. "ONT replacement, Signal check". */
  inca_actions: string | null;
  area: string | null;
  customer_name: string | null;
  remarks: string | null;
  status: 'Posted' | 'Adjusted' | 'Reversed';
  adjustment_note: string | null;
};

export type InventorySummary = {
  totals: {
    lines: number;
    tickets: number;
    technicians: number;
    reversed: number;
  };
  by_technician: {
    technician_user_id: string;
    technician_name: string;
    tickets: number;
    lines: number;
    items: { item_name: string; uom: string; quantity: number }[];
  }[];
  by_item: {
    item_id: string;
    item_code: string;
    item_name: string;
    uom: string;
    quantity: number;
    lines: number;
    serials: number;
  }[];
};

const MAX_ROWS = 10_000;
const MALDIVES_OFFSET_MS = 5 * 60 * 60 * 1000;

const COLUMNS: {
  header: string;
  value: (row: InventoryReportRow) => string | number | null;
}[] = [
  { header: 'Date / time', value: (row) => displayDate(row.posted_at) },
  { header: 'SR ID', value: (row) => row.sr_number ?? row.crm_ticket_id },
  { header: 'Technician', value: (row) => row.technician_name },
  { header: 'Department', value: (row) => row.department },
  { header: 'Item code', value: (row) => row.item_code },
  { header: 'Item', value: (row) => row.item_name },
  { header: 'Quantity', value: (row) => row.quantity },
  { header: 'UOM', value: (row) => row.uom },
  { header: 'Serial number', value: (row) => row.serial_number },
  { header: 'Service type', value: (row) => row.service_type },
  { header: 'INCA action', value: (row) => row.inca_actions },
  { header: 'Area', value: (row) => row.area },
  { header: 'Customer', value: (row) => row.customer_name },
  { header: 'Remarks', value: (row) => row.remarks },
  { header: 'Status', value: (row) => row.status },
  { header: 'Adjustment', value: (row) => row.adjustment_note },
];

@Injectable()
export class InventoryReportService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: InventoryReportQuery): Promise<InventoryReportRow[]> {
    const lines = await this.prisma.ticketInventoryConsumption.findMany({
      where: await this.where(query),
      orderBy: { posted_at: 'desc' },
      take: MAX_ROWS,
      include: {
        item: { select: { code: true } },
        adjustments: { orderBy: { created_at: 'asc' } },
      },
    });
    const [names, actions] = await Promise.all([
      this.technicianNames(lines.map((line) => line.technician_user_id)),
      this.incaActions(lines.map((line) => line.crm_ticket_id)),
    ]);
    return lines.map((line) => {
      const last = line.adjustments[line.adjustments.length - 1];
      const status =
        line.status === 'REVERSED'
          ? 'Reversed'
          : line.adjustments.length
            ? 'Adjusted'
            : 'Posted';
      return {
        id: line.id,
        posted_at: line.posted_at,
        crm_ticket_id: line.crm_ticket_id,
        sr_number: line.sr_number,
        technician_user_id: line.technician_user_id,
        technician_name: names.get(line.technician_user_id) ?? 'Unknown user',
        department: line.department,
        item_id: line.item_id,
        item_code: line.item.code,
        item_name: line.item_name,
        quantity: effectiveQuantity(line),
        original_quantity: Number(line.quantity),
        uom: line.uom,
        serial_number: line.serial_number,
        service_type: line.service_type,
        inca_actions: actions.get(line.crm_ticket_id) ?? null,
        area: line.area,
        customer_name: line.customer_name,
        remarks: line.remarks,
        status,
        adjustment_note: last ? last.reason : null,
      };
    });
  }

  summarize(rows: InventoryReportRow[]): InventorySummary {
    const active = rows.filter((row) => row.status !== 'Reversed');
    const technicians = new Map<
      string,
      InventorySummary['by_technician'][number] & { ticketSet: Set<string> }
    >();
    const items = new Map<string, InventorySummary['by_item'][number]>();
    for (const row of active) {
      const tech = technicians.get(row.technician_user_id) ?? {
        technician_user_id: row.technician_user_id,
        technician_name: row.technician_name,
        tickets: 0,
        lines: 0,
        items: [],
        ticketSet: new Set<string>(),
      };
      tech.lines += 1;
      tech.ticketSet.add(row.crm_ticket_id);
      const techItem = tech.items.find(
        (entry) => entry.item_name === row.item_name && entry.uom === row.uom,
      );
      if (techItem) {
        techItem.quantity = round2(techItem.quantity + row.quantity);
      } else {
        tech.items.push({
          item_name: row.item_name,
          uom: row.uom,
          quantity: row.quantity,
        });
      }
      technicians.set(row.technician_user_id, tech);

      const item = items.get(row.item_id) ?? {
        item_id: row.item_id,
        item_code: row.item_code,
        item_name: row.item_name,
        uom: row.uom,
        quantity: 0,
        lines: 0,
        serials: 0,
      };
      item.quantity = round2(item.quantity + row.quantity);
      item.lines += 1;
      if (row.serial_number) item.serials += 1;
      items.set(row.item_id, item);
    }
    return {
      totals: {
        lines: active.length,
        tickets: new Set(active.map((row) => row.crm_ticket_id)).size,
        technicians: technicians.size,
        reversed: rows.length - active.length,
      },
      by_technician: [...technicians.values()]
        .map(({ ticketSet, ...tech }) => ({
          ...tech,
          tickets: ticketSet.size,
          items: tech.items.sort((a, b) =>
            a.item_name.localeCompare(b.item_name),
          ),
        }))
        .sort(
          (a, b) =>
            b.lines - a.lines ||
            a.technician_name.localeCompare(b.technician_name),
        ),
      by_item: [...items.values()].sort(
        (a, b) => b.lines - a.lines || a.item_name.localeCompare(b.item_name),
      ),
    };
  }

  async filterOptions() {
    const distinct = async (field: 'department' | 'service_type' | 'area') => {
      const rows = await this.prisma.ticketInventoryConsumption.findMany({
        where: { [field]: { not: null } },
        distinct: [field],
        select: { [field]: true },
      });
      return rows
        .map((row) => (row as unknown as Record<string, string | null>)[field])
        .filter((value): value is string => Boolean(value))
        .sort((a, b) => a.localeCompare(b));
    };
    const [departments, serviceTypes, areas, technicianIds, items] =
      await Promise.all([
        distinct('department'),
        distinct('service_type'),
        distinct('area'),
        this.prisma.ticketInventoryConsumption.findMany({
          distinct: ['technician_user_id'],
          select: { technician_user_id: true },
        }),
        this.prisma.inventoryItem.findMany({
          orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
          select: { id: true, code: true, name: true, active: true },
        }),
      ]);
    const names = await this.technicianNames(
      technicianIds.map((row) => row.technician_user_id),
    );
    return {
      departments,
      service_types: serviceTypes,
      inca_actions: Object.entries(ACTION_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      areas,
      technicians: [...names.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      items,
      default_from: this.startOfMaldivesMonth().toISOString(),
    };
  }

  toCsv(rows: InventoryReportRow[]): string {
    const escape = (value: string | number | null) => {
      const text = value === null || value === undefined ? '' : String(value);
      // Leading =, +, - or @ would be evaluated as a formula by spreadsheet apps.
      const safe =
        /^[=+\-@\t\r]/.test(text) && typeof value !== 'number'
          ? `'${text}`
          : text;
      return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const lines = [
      COLUMNS.map((column) => escape(column.header)).join(','),
      ...rows.map((row) =>
        COLUMNS.map((column) => escape(column.value(row))).join(','),
      ),
    ];
    return `\uFEFF${lines.join('\r\n')}\r\n`;
  }

  toExcel(rows: InventoryReportRow[]): string {
    const cell = (value: string | number | null) =>
      typeof value === 'number'
        ? `<Cell><Data ss:Type="Number">${value}</Data></Cell>`
        : `<Cell><Data ss:Type="String">${escapeXml(value ?? '')}</Data></Cell>`;
    const header = COLUMNS.map((column) => cell(column.header)).join('');
    const body = rows
      .map(
        (row) =>
          `<Row>${COLUMNS.map((column) => cell(column.value(row))).join('')}</Row>`,
      )
      .join('\n');
    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Inventory consumption">
<Table>
<Row>${header}</Row>
${body}
</Table>
</Worksheet>
</Workbook>`;
  }

  private async where(
    query: InventoryReportQuery,
  ): Promise<Prisma.TicketInventoryConsumptionWhereInput> {
    const filters: Prisma.TicketInventoryConsumptionWhereInput[] = [];
    const from = parseDate(query.from) ?? this.startOfMaldivesMonth();
    const to = parseDate(query.to, true);
    filters.push({ posted_at: to ? { gte: from, lte: to } : { gte: from } });

    const technicians = splitList(query.technician_ids);
    if (technicians.length)
      filters.push({ technician_user_id: { in: technicians } });
    const items = splitList(query.item_ids);
    if (items.length) filters.push({ item_id: { in: items } });
    for (const field of ['department', 'service_type', 'area'] as const) {
      const value = query[field]?.trim();
      if (value)
        filters.push({ [field]: { equals: value, mode: 'insensitive' } });
    }
    const sr = query.sr?.trim();
    if (sr) {
      filters.push({
        OR: [
          { sr_number: { contains: sr, mode: 'insensitive' } },
          { crm_ticket_id: sr },
          { serial_number: { contains: sr, mode: 'insensitive' } },
        ],
      });
    }
    const status = query.status?.trim().toUpperCase();
    if (status === 'POSTED' || status === 'REVERSED') filters.push({ status });
    const action = query.inca_action?.trim().toUpperCase();
    if (action && action in ACTION_LABELS) {
      const tickets = await this.prisma.provisioningTransaction.findMany({
        where: { action: action as ProvisioningAction, status: 'SUCCEEDED' },
        distinct: ['crm_ticket_id'],
        select: { crm_ticket_id: true },
      });
      filters.push({
        crm_ticket_id: { in: tickets.map((txn) => txn.crm_ticket_id) },
      });
    }
    return { AND: filters };
  }

  private async incaActions(ticketIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ticketIds)];
    if (!unique.length) return new Map();
    const txns = await this.prisma.provisioningTransaction.findMany({
      where: { crm_ticket_id: { in: unique }, status: 'SUCCEEDED' },
      distinct: ['crm_ticket_id', 'action'],
      select: { crm_ticket_id: true, action: true },
    });
    const byTicket = new Map<string, Set<string>>();
    for (const txn of txns) {
      const labels = byTicket.get(txn.crm_ticket_id) ?? new Set<string>();
      labels.add(ACTION_LABELS[txn.action]);
      byTicket.set(txn.crm_ticket_id, labels);
    }
    return new Map(
      [...byTicket].map(([ticket, labels]) => [
        ticket,
        [...labels].sort().join(', '),
      ]),
    );
  }

  private async technicianNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, email: true },
    });
    return new Map(
      users.map((user) => [user.id, user.name?.trim() || user.email]),
    );
  }

  private startOfMaldivesMonth(): Date {
    const local = new Date(Date.now() + MALDIVES_OFFSET_MS);
    return new Date(
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) -
        MALDIVES_OFFSET_MS,
    );
  }
}

function splitList(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 200);
}

/** Plain YYYY-MM-DD dates are whole days in Maldives time. */
function parseDate(value?: string, endOfDay = false): Date | null {
  const raw = value?.trim();
  if (!raw) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+05:00`)
    : new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function displayDate(value: Date): string {
  const local = new Date(value.getTime() + MALDIVES_OFFSET_MS);
  return local.toISOString().slice(0, 16).replace('T', ' ');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
