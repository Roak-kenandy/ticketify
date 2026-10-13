import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryAdjustment,
  InventoryDeclarationType,
  InventoryItem,
  Prisma,
  TicketInventoryConsumption,
} from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import { TicketAccessService } from 'src/infrastructure/security/ticket-access.service';
import { hasAnyRole, INVENTORY_ROLES } from 'src/auth/ops-roles';
import { InventoryDeclarationDto, InventoryLineDto } from './dto/inventory.dto';
import { InventoryItemsService } from './inventory-items.service';
import { TicketSnapshotService } from './ticket-snapshot.service';
import { normalizeSerial, SERIAL_PATTERN } from './serial';
import { TechnicianStockService } from './technician-stock.service';

export { normalizeSerial } from './serial';

export type InventoryActor = {
  id: string;
  name?: string | null;
  crm_user_id?: string;
  role?: unknown;
};

type LineWithRelations = TicketInventoryConsumption & {
  item: Pick<
    InventoryItem,
    'code' | 'serialized' | 'allow_decimal' | 'consumption_uom'
  >;
  adjustments: InventoryAdjustment[];
};

export type InventoryLineView = {
  id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  serialized: boolean;
  allow_decimal: boolean;
  quantity: number;
  effective_quantity: number;
  uom: string;
  serial_number: string | null;
  remarks: string | null;
  status: 'POSTED' | 'REVERSED';
  adjusted: boolean;
  provisioning_transaction_id: string | null;
  technician_user_id: string;
  posted_at: Date;
  adjustments: {
    id: string;
    quantity_delta: number;
    reason: string;
    requested_by_user_id: string;
    created_at: Date;
  }[];
};

export type ProposedInventoryLine = {
  item_id: string;
  item_code: string;
  item_name: string;
  uom: string;
  quantity: number;
  serial_number: string;
  provisioning_transaction_id: string;
  reason: string;
};

export type TicketInventoryHeader = {
  sr_number: string | null;
  customer_name: string | null;
  terminal_node_id: string | null;
  department: string | null;
  service_type: string | null;
  area: string | null;
};

export type TicketInventoryView = {
  crm_ticket_id: string;
  /** Read-only facts for the entry screen; null when CRM is unreachable. */
  header: TicketInventoryHeader | null;
  declaration: {
    type: InventoryDeclarationType;
    declared_by_user_id: string;
    declared_at: Date;
    updated_at: Date;
  } | null;
  lines: InventoryLineView[];
  proposed_lines: ProposedInventoryLine[];
  locked: boolean;
};

/** Ticket closure is audited under this action; afterwards only the inventory team edits. */
export const TICKET_CLOSED_ACTION = 'TICKET_CLOSED';

const CLOSED_STATES = new Set(['CLOSED', 'CANCELLED', 'CANCELED', 'RESOLVED']);

const ITEM_SELECT = {
  code: true,
  serialized: true,
  allow_decimal: true,
  consumption_uom: true,
} as const;

function decimalPlaces(value: number): number {
  const [, fraction = ''] = String(value).split('.');
  return fraction.length;
}

@Injectable()
export class TicketInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IntegrationAuditService,
    private readonly items: InventoryItemsService,
    private readonly snapshots: TicketSnapshotService,
    private readonly access: TicketAccessService,
    private readonly stock: TechnicianStockService,
  ) {}

  async view(crmTicketId: string): Promise<TicketInventoryView> {
    const [declaration, lines, locked, header] = await Promise.all([
      this.prisma.ticketInventoryDeclaration.findUnique({
        where: { crm_ticket_id: crmTicketId },
      }),
      this.loadLines(crmTicketId),
      this.isClosed(crmTicketId),
      this.header(crmTicketId),
    ]);
    const views = lines.map(toLineView);
    return {
      crm_ticket_id: crmTicketId,
      header,
      declaration: declaration
        ? {
            type: declaration.declaration,
            declared_by_user_id: declaration.declared_by_user_id,
            declared_at: declaration.declared_at,
            updated_at: declaration.updated_at,
          }
        : null,
      lines: views,
      proposed_lines: await this.proposedLines(crmTicketId, views),
      locked,
    };
  }

  async declare(
    crmTicketId: string,
    actor: InventoryActor,
    dto: InventoryDeclarationDto,
  ): Promise<TicketInventoryView> {
    await this.assertEditable(crmTicketId, actor);
    const key = `inv:${crmTicketId}:${dto.idempotency_key}`;
    const replayed = await this.prisma.integrationAuditLog.findUnique({
      where: { idempotency_key: key },
      select: { id: true },
    });
    if (replayed) {
      return this.view(crmTicketId);
    }

    const lines = dto.lines ?? [];
    const posted = await this.loadLines(crmTicketId).then((rows) =>
      rows.filter((row) => row.status === 'POSTED'),
    );
    if (dto.declaration === 'NONE_USED') {
      if (lines.length) {
        throw new BadRequestException(
          '"No inventory used" cannot include item lines.',
        );
      }
      if (posted.length) {
        throw new BadRequestException(
          'Items are already posted on this service request. Reverse them before declaring no inventory used.',
        );
      }
    } else if (!lines.length && !posted.length) {
      throw new BadRequestException(
        'Add at least one item, or declare "No inventory used".',
      );
    }

    const prepared = await this.prepareLines(crmTicketId, lines);
    const snapshot = await this.snapshots.get(crmTicketId);
    const fromIssuedStock = !this.isInventoryTeam(actor);

    try {
      await this.prisma.$transaction(async (tx) => {
        if (fromIssuedStock && prepared.length) {
          await this.stock.assertCanDraw(
            tx,
            actor.id,
            prepared.map((line) => ({ item: line.item, quantity: line.quantity, serial: line.serial })),
          );
        }
        await tx.ticketInventoryDeclaration.upsert({
          where: { crm_ticket_id: crmTicketId },
          create: {
            crm_ticket_id: crmTicketId,
            sr_number: snapshot.sr_number,
            declaration: dto.declaration,
            declared_by_user_id: actor.id,
            department: snapshot.department,
            service_type: snapshot.service_type,
            area: snapshot.area,
            customer_name: snapshot.customer_name,
          },
          update: {
            declaration: dto.declaration,
            declared_by_user_id: actor.id,
            sr_number: snapshot.sr_number,
          },
        });
        for (const [index, line] of prepared.entries()) {
          const created = await tx.ticketInventoryConsumption.create({
            data: {
              stock_tracked: fromIssuedStock,
              crm_ticket_id: crmTicketId,
              sr_number: snapshot.sr_number,
              item_id: line.item.id,
              item_name: line.item.name,
              quantity: new Prisma.Decimal(line.quantity),
              uom: line.item.consumption_uom,
              serial_number: line.serial,
              remarks: line.remarks,
              technician_user_id: actor.id,
              department: snapshot.department,
              service_type: snapshot.service_type,
              area: snapshot.area,
              customer_name: snapshot.customer_name,
              provisioning_transaction_id: line.provisioningTransactionId,
              idempotency_key: `${key}:${index}`,
            },
          });
          if (fromIssuedStock && line.serial) {
            await this.stock.markConsumed(tx, line.serial, created.id);
          }
        }
      });
    } catch (error) {
      this.rethrowUniqueViolation(error);
      throw error;
    }

    await this.audit.log({
      entity_type: 'ticket_inventory',
      entity_id: crmTicketId,
      action: 'INVENTORY_DECLARED',
      actor_user_id: actor.id,
      new_state: {
        sr_number: snapshot.sr_number,
        declaration: dto.declaration,
        lines: prepared.map((line) => ({
          item_code: line.item.code,
          quantity: line.quantity,
          uom: line.item.consumption_uom,
          serial_number: line.serial,
        })),
      },
      idempotency_key: key,
    });
    return this.view(crmTicketId);
  }

  async reverse(lineId: string, actor: InventoryActor, reason: string) {
    const line = await this.findLine(lineId);
    await this.assertEditable(line.crm_ticket_id, actor);
    if (line.status !== 'POSTED') {
      throw new BadRequestException('This line is already reversed.');
    }
    const effective = effectiveQuantity(line);
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.ticketInventoryConsumption.updateMany({
        where: { id: lineId, status: 'POSTED' },
        data: { status: 'REVERSED' },
      });
      if (!result.count) {
        throw new ConflictException(
          'This line was changed by someone else. Refresh and try again.',
        );
      }
      await tx.inventoryAdjustment.create({
        data: {
          consumption_id: lineId,
          quantity_delta: new Prisma.Decimal(-effective),
          reason: reason.trim(),
          requested_by_user_id: actor.id,
          approved_by_user_id: this.isInventoryTeam(actor) ? actor.id : null,
        },
      });
      if (line.stock_tracked) {
        await this.stock.releaseConsumption(tx, lineId);
      }
    });
    await this.audit.log({
      entity_type: 'ticket_inventory',
      entity_id: line.crm_ticket_id,
      action: 'INVENTORY_LINE_REVERSED',
      actor_user_id: actor.id,
      old_state: {
        line_id: lineId,
        quantity: effective,
        serial_number: line.serial_number,
      },
      new_state: { status: 'REVERSED', reason: reason.trim() },
    });
    return this.view(line.crm_ticket_id);
  }

  async adjust(
    lineId: string,
    actor: InventoryActor,
    quantity: number,
    reason: string,
  ) {
    if (!this.isInventoryTeam(actor)) {
      throw new ForbiddenException(
        'Only the inventory team can adjust posted quantities.',
      );
    }
    const line = await this.findLine(lineId);
    if (line.status !== 'POSTED') {
      throw new BadRequestException('Reversed lines cannot be adjusted.');
    }
    if (line.item.serialized) {
      throw new BadRequestException(
        'Serialized devices are always one unit. Reverse the line instead.',
      );
    }
    this.assertQuantity(line.item, line.item_name, quantity);
    const before = effectiveQuantity(line);
    const delta = round2(quantity - before);
    if (delta === 0) {
      throw new BadRequestException(
        'The new quantity is the same as the current quantity.',
      );
    }
    await this.prisma.inventoryAdjustment.create({
      data: {
        consumption_id: lineId,
        quantity_delta: new Prisma.Decimal(delta),
        reason: reason.trim(),
        requested_by_user_id: actor.id,
        approved_by_user_id: actor.id,
      },
    });
    await this.audit.log({
      entity_type: 'ticket_inventory',
      entity_id: line.crm_ticket_id,
      action: 'INVENTORY_LINE_ADJUSTED',
      actor_user_id: actor.id,
      old_state: { line_id: lineId, quantity: before },
      new_state: { quantity, delta, reason: reason.trim() },
    });
    return this.view(line.crm_ticket_id);
  }

  private async header(
    crmTicketId: string,
  ): Promise<TicketInventoryHeader | null> {
    const [snapshot, provisioned] = await Promise.all([
      this.snapshots.get(crmTicketId).catch(() => null),
      this.prisma.provisioningTransaction.findFirst({
        where: { crm_ticket_id: crmTicketId, status: 'SUCCEEDED' },
        orderBy: { started_at: 'desc' },
        select: { result: true },
      }),
    ]);
    if (!snapshot) return null;
    const result = provisioned?.result as { terminal_node_id?: string } | null;
    return {
      sr_number: snapshot.sr_number,
      customer_name: snapshot.customer_name,
      terminal_node_id: result?.terminal_node_id ?? null,
      department: snapshot.department,
      service_type: snapshot.service_type,
      area: snapshot.area,
    };
  }

  /** Facts the closure gate needs, without the CRM round-trip. */
  async closureState(crmTicketId: string) {
    const [declaration, lines] = await Promise.all([
      this.prisma.ticketInventoryDeclaration.findUnique({
        where: { crm_ticket_id: crmTicketId },
        select: { declaration: true },
      }),
      this.loadLines(crmTicketId),
    ]);
    return {
      declaration: declaration?.declaration ?? null,
      posted: lines
        .filter((line) => line.status === 'POSTED')
        .map((line) => ({
          serialized: line.item.serialized,
          serial_number: line.serial_number,
          quantity: effectiveQuantity(line),
        })),
    };
  }

  /** CRM state decides (a reopened SR is editable again); the closure audit is the offline fallback. */
  async isClosed(crmTicketId: string): Promise<boolean> {
    const state = await this.snapshots
      .get(crmTicketId)
      .then((snapshot) => snapshot.state)
      .catch(() => undefined);
    if (state !== undefined && state !== null) {
      return CLOSED_STATES.has(state);
    }
    const closed = await this.prisma.integrationAuditLog.findFirst({
      where: {
        entity_type: 'ticket',
        entity_id: crmTicketId,
        action: TICKET_CLOSED_ACTION,
      },
      select: { id: true },
    });
    return Boolean(closed);
  }

  private async assertEditable(crmTicketId: string, actor: InventoryActor) {
    if (this.isInventoryTeam(actor)) {
      return;
    }
    if (!(await this.access.canAccess(actor, 'ticket', crmTicketId))) {
      throw new ForbiddenException('You do not have access to this ticket');
    }
    if (await this.isClosed(crmTicketId)) {
      throw new ForbiddenException(
        'This service request is closed. Ask the inventory team to correct its inventory.',
      );
    }
  }

  private isInventoryTeam(actor: InventoryActor) {
    return hasAnyRole(INVENTORY_ROLES, actor.role);
  }

  private async prepareLines(crmTicketId: string, lines: InventoryLineDto[]) {
    const prepared: {
      item: InventoryItem;
      quantity: number;
      serial: string | null;
      remarks: string | null;
      provisioningTransactionId: string | null;
    }[] = [];
    const seenSerials = new Set<string>();
    for (const line of lines) {
      const item = await this.items.findActive(line.item_id);
      this.assertQuantity(item, item.name, line.quantity);
      const serial = normalizeSerial(line.serial_number);
      const remarks = line.remarks?.trim() || null;
      if (item.serialized) {
        if (!serial) {
          throw new BadRequestException(
            `${item.name}: scan or enter the serial number.`,
          );
        }
        if (!SERIAL_PATTERN.test(serial)) {
          throw new BadRequestException(
            `${item.name}: "${serial}" is not a valid serial number.`,
          );
        }
        if (line.quantity !== 1) {
          throw new BadRequestException(
            `${item.name}: each serial number is exactly 1 unit.`,
          );
        }
        if (seenSerials.has(serial)) {
          throw new BadRequestException(`Serial ${serial} is listed twice.`);
        }
        seenSerials.add(serial);
      } else if (serial) {
        throw new BadRequestException(
          `${item.name} is not tracked by serial number.`,
        );
      }
      if (item.remarks_required && !remarks) {
        throw new BadRequestException(`${item.name}: remarks are required.`);
      }
      let provisioningTransactionId: string | null = null;
      if (line.provisioning_transaction_id) {
        const txn = await this.prisma.provisioningTransaction.findUnique({
          where: { id: line.provisioning_transaction_id },
          select: { crm_ticket_id: true },
        });
        if (txn?.crm_ticket_id !== crmTicketId) {
          throw new BadRequestException(
            'Provisioning reference does not belong to this service request.',
          );
        }
        provisioningTransactionId = line.provisioning_transaction_id;
      }
      prepared.push({
        item,
        quantity: line.quantity,
        serial,
        remarks,
        provisioningTransactionId,
      });
    }

    if (seenSerials.size) {
      const taken = await this.prisma.ticketInventoryConsumption.findFirst({
        where: {
          status: 'POSTED',
          OR: [...seenSerials].map((serial) => ({
            serial_number: { equals: serial, mode: 'insensitive' as const },
          })),
        },
        select: { serial_number: true, sr_number: true, crm_ticket_id: true },
      });
      if (taken) {
        throw new ConflictException(
          `Serial ${taken.serial_number} is already recorded on ${
            taken.crm_ticket_id === crmTicketId
              ? 'this service request'
              : `SR ${taken.sr_number ?? taken.crm_ticket_id}`
          }.`,
        );
      }
    }
    return prepared;
  }

  private assertQuantity(
    item: Pick<InventoryItem, 'allow_decimal' | 'consumption_uom'>,
    name: string,
    quantity: number,
  ) {
    if (!(quantity > 0)) {
      throw new BadRequestException(
        `${name}: quantity must be greater than zero.`,
      );
    }
    if (!item.allow_decimal && !Number.isInteger(quantity)) {
      throw new BadRequestException(
        `${name} is counted in whole ${item.consumption_uom.toLowerCase()}s.`,
      );
    }
    if (decimalPlaces(quantity) > 2) {
      throw new BadRequestException(`${name}: use at most 2 decimal places.`);
    }
  }

  private async proposedLines(
    crmTicketId: string,
    lines: InventoryLineView[],
  ): Promise<ProposedInventoryLine[]> {
    const installs = await this.prisma.provisioningTransaction.findMany({
      where: {
        crm_ticket_id: crmTicketId,
        status: 'SUCCEEDED',
        installs_ont: true,
        ont_serial: { not: null },
      },
      orderBy: { finished_at: 'desc' },
      select: { id: true, ont_serial: true, action: true, submitted: true },
    });
    if (!installs.length) {
      return [];
    }
    const postedSerials = new Set(
      lines
        .filter((line) => line.status === 'POSTED' && line.serial_number)
        .map((line) => line.serial_number),
    );
    const serializedItems = await this.prisma.inventoryItem.findMany({
      where: { serialized: true, active: true },
      orderBy: { sort_order: 'asc' },
    });
    const proposals: ProposedInventoryLine[] = [];
    const seen = new Set<string>();
    for (const install of installs) {
      const serial = normalizeSerial(install.ont_serial);
      if (!serial || postedSerials.has(serial) || seen.has(serial)) continue;
      seen.add(serial);
      const code = (install.submitted as { device_item_code?: string } | null)
        ?.device_item_code;
      const item =
        serializedItems.find((candidate) => candidate.code === code) ??
        serializedItems[0];
      if (!item) continue;
      proposals.push({
        item_id: item.id,
        item_code: item.code,
        item_name: item.name,
        uom: item.consumption_uom,
        quantity: 1,
        serial_number: serial,
        provisioning_transaction_id: install.id,
        reason:
          install.action === 'ONT_REPLACEMENT'
            ? 'Replacement ONT installed'
            : 'ONT installed during provisioning',
      });
    }
    return proposals;
  }

  private loadLines(crmTicketId: string): Promise<LineWithRelations[]> {
    return this.prisma.ticketInventoryConsumption.findMany({
      where: { crm_ticket_id: crmTicketId },
      orderBy: { posted_at: 'asc' },
      include: {
        item: { select: ITEM_SELECT },
        adjustments: { orderBy: { created_at: 'asc' } },
      },
    });
  }

  private async findLine(lineId: string): Promise<LineWithRelations> {
    const line = await this.prisma.ticketInventoryConsumption.findUnique({
      where: { id: lineId },
      include: {
        item: { select: ITEM_SELECT },
        adjustments: { orderBy: { created_at: 'asc' } },
      },
    });
    if (!line) {
      throw new NotFoundException('Inventory line not found');
    }
    return line;
  }

  private rethrowUniqueViolation(error: unknown) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return;
    }
    const target = JSON.stringify(error.meta?.target ?? '');
    if (target.includes('idempotency_key')) {
      throw new ConflictException(
        'This submission is already being saved. Refresh in a moment.',
      );
    }
    throw new ConflictException(
      'One of these serial numbers was just recorded on another service request.',
    );
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function effectiveQuantity(
  line: Pick<TicketInventoryConsumption, 'status' | 'quantity'> & {
    adjustments: Pick<InventoryAdjustment, 'quantity_delta'>[];
  },
): number {
  if (line.status !== 'POSTED') {
    return 0;
  }
  return round2(
    line.adjustments.reduce(
      (sum, adjustment) => sum + Number(adjustment.quantity_delta),
      Number(line.quantity),
    ),
  );
}

function toLineView(line: LineWithRelations): InventoryLineView {
  return {
    id: line.id,
    item_id: line.item_id,
    item_code: line.item.code,
    item_name: line.item_name,
    serialized: line.item.serialized,
    allow_decimal: line.item.allow_decimal,
    quantity: Number(line.quantity),
    effective_quantity: effectiveQuantity(line),
    uom: line.uom,
    serial_number: line.serial_number,
    remarks: line.remarks,
    status: line.status,
    adjusted: line.status === 'POSTED' && line.adjustments.length > 0,
    provisioning_transaction_id: line.provisioning_transaction_id,
    technician_user_id: line.technician_user_id,
    posted_at: line.posted_at,
    adjustments: line.adjustments.map((adjustment) => ({
      id: adjustment.id,
      quantity_delta: Number(adjustment.quantity_delta),
      reason: adjustment.reason,
      requested_by_user_id: adjustment.requested_by_user_id,
      created_at: adjustment.created_at,
    })),
  };
}
