import { Injectable } from '@nestjs/common';
import { Prisma, ProvisioningAction } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { ACTION_LABELS } from 'src/provisioning/provisioning-policy';
import { effectiveQuantity } from './ticket-inventory.service';
import {
  displayDate,
  parseDate,
  ReportColumn,
  round2,
  splitList,
  startOfMaldivesMonth,
  toCsv,
  toExcel,
} from './report-format';

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
  /** Business line: department + service type of the SR. */
  by_business_line: {
    department: string;
    service_type: string;
    tickets: number;
    lines: number;
    items: { item_name: string; uom: string; quantity: number }[];
  }[];
};

const MAX_ROWS = 10_000;

const COLUMNS: ReportColumn<InventoryReportRow>[] = [
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
    const businessLines = new Map<
      string,
      InventorySummary['by_business_line'][number] & { ticketSet: Set<string> }
    >();
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

      const department = row.department?.trim() || 'Unspecified';
      const serviceType = row.service_type?.trim() || 'Unspecified';
      const lineKey = `${department}\u0000${serviceType}`;
      const line = businessLines.get(lineKey) ?? {
        department,
        service_type: serviceType,
        tickets: 0,
        lines: 0,
        items: [],
        ticketSet: new Set<string>(),
      };
      line.lines += 1;
      line.ticketSet.add(row.crm_ticket_id);
      const lineItem = line.items.find(
        (entry) => entry.item_name === row.item_name && entry.uom === row.uom,
      );
      if (lineItem) {
        lineItem.quantity = round2(lineItem.quantity + row.quantity);
      } else {
        line.items.push({ item_name: row.item_name, uom: row.uom, quantity: row.quantity });
      }
      businessLines.set(lineKey, line);
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
      by_business_line: [...businessLines.values()]
        .map(({ ticketSet, ...line }) => ({
          ...line,
          tickets: ticketSet.size,
          items: line.items.sort((a, b) => a.item_name.localeCompare(b.item_name)),
        }))
        .sort(
          (a, b) =>
            b.tickets - a.tickets ||
            a.department.localeCompare(b.department) ||
            a.service_type.localeCompare(b.service_type),
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
      default_from: startOfMaldivesMonth().toISOString(),
    };
  }

  toCsv(rows: InventoryReportRow[]): string {
    return toCsv(COLUMNS, rows);
  }

  toExcel(rows: InventoryReportRow[]): string {
    return toExcel('Inventory consumption', COLUMNS, rows);
  }

  private async where(
    query: InventoryReportQuery,
  ): Promise<Prisma.TicketInventoryConsumptionWhereInput> {
    const filters: Prisma.TicketInventoryConsumptionWhereInput[] = [];
    const from = parseDate(query.from) ?? startOfMaldivesMonth();
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
}
