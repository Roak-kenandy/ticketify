import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { StockRequestStatus } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import { InventoryItemsService } from './inventory-items.service';
import { round2 } from './report-format';
import { StockRequestDto } from './dto/stock.dto';
import { holderKind, StockActor, TechnicianStockService } from './technician-stock.service';

type RequestLine = { item_id: string; item_name: string; quantity: number; uom: string };

@Injectable()
export class StockRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IntegrationAuditService,
    private readonly items: InventoryItemsService,
    private readonly stock: TechnicianStockService,
  ) {}

  async create(actor: StockActor, dto: StockRequestDto) {
    if (holderKind(actor.access) !== 'SUPERVISOR') {
      throw new ForbiddenException('Only supervisors request stock from the store.');
    }
    const lines: RequestLine[] = [];
    for (const line of dto.lines) {
      const item = await this.items.findActive(line.item_id);
      if (lines.some((existing) => existing.item_id === item.id)) {
        throw new BadRequestException(`${item.name} is listed twice.`);
      }
      const quantity = round2(line.quantity);
      if ((item.serialized || !item.allow_decimal) && !Number.isInteger(quantity)) {
        throw new BadRequestException(`${item.name} is counted in whole ${item.consumption_uom.toLowerCase()}s.`);
      }
      lines.push({ item_id: item.id, item_name: item.name, quantity, uom: item.consumption_uom });
    }
    const request = await this.prisma.stockRequest.create({
      data: { requested_by_user_id: actor.id, lines, notes: dto.notes?.trim() || null },
    });
    await this.audit.log({
      entity_type: 'stock_request',
      entity_id: request.id,
      action: 'STOCK_REQUESTED',
      actor_user_id: actor.id,
      new_state: { lines, notes: request.notes },
    });
    return this.get(request.id);
  }

  /** The store sees every request; a supervisor sees their own. */
  async list(actor: StockActor, status?: string) {
    const wanted = status?.trim().toUpperCase();
    const requests = await this.prisma.stockRequest.findMany({
      where: {
        ...(this.isStore(actor) ? {} : { requested_by_user_id: actor.id }),
        ...(wanted && wanted in StockRequestStatus ? { status: wanted as StockRequestStatus } : {}),
      },
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
      take: 200,
    });
    const userIds = [
      ...new Set(requests.flatMap((request) => [request.requested_by_user_id, request.closed_by_user_id ?? ''])),
    ].filter(Boolean);
    const openBy = [...new Set(requests.filter((r) => r.status === 'OPEN').map((r) => r.requested_by_user_id))];
    const [users, totals] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
      openBy.length ? this.stock.totals({ technicianIds: openBy }) : Promise.resolve([]),
    ]);
    const names = new Map(users.map((user) => [user.id, user.name?.trim() || user.email]));
    return requests.map((request) => ({
      id: request.id,
      status: request.status,
      requested_by_user_id: request.requested_by_user_id,
      requested_by_name: names.get(request.requested_by_user_id) ?? 'Unknown user',
      notes: request.notes,
      created_at: request.created_at,
      closed_at: request.closed_at,
      closed_by_name: request.closed_by_user_id ? names.get(request.closed_by_user_id) ?? 'Unknown user' : null,
      fulfilled_batch_id: request.fulfilled_batch_id,
      lines: (request.lines as RequestLine[]).map((line) => ({
        ...line,
        /** What the supervisor still holds of this item, for open requests. */
        in_hand:
          request.status === 'OPEN'
            ? totals.find((entry) => entry.technician_user_id === request.requested_by_user_id && entry.item_id === line.item_id)
                ?.in_hand ?? 0
            : null,
      })),
    }));
  }

  /**
   * Polled by the console. The store hears about open requests; a supervisor hears
   * when the store issued or declined one of theirs (last 7 days).
   */
  async alerts(actor: StockActor) {
    const store = this.isStore(actor);
    const requests = await this.prisma.stockRequest.findMany({
      where: store
        ? { status: 'OPEN' }
        : {
            requested_by_user_id: actor.id,
            status: { in: ['FULFILLED', 'CANCELLED'] },
            closed_at: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
            NOT: { closed_by_user_id: actor.id },
          },
      orderBy: store ? { created_at: 'desc' } : { closed_at: 'desc' },
      take: 50,
    });
    const userIds = [...new Set(requests.map((request) => request.requested_by_user_id))];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : [];
    const names = new Map(users.map((user) => [user.id, user.name?.trim() || user.email]));
    const summary = (lines: RequestLine[]) =>
      lines.map((line) => `${line.item_name} × ${Number(line.quantity)} ${line.uom}`).join(', ');
    return {
      audience: store ? 'STORE' : 'SUPERVISOR',
      items: requests.map((request) => {
        const lines = summary(request.lines as RequestLine[]);
        return {
          /** Changes when the request changes state, so each state is announced once. */
          key: `${request.id}:${request.status}`,
          request_id: request.id,
          status: request.status,
          title: store
            ? `Stock request from ${names.get(request.requested_by_user_id) ?? 'a supervisor'}`
            : request.status === 'FULFILLED'
              ? 'Your stock request was issued'
              : 'Your stock request was declined',
          body: lines,
          at: store ? request.created_at : request.closed_at,
        };
      }),
    };
  }

  async cancel(actor: StockActor, id: string) {
    const closed = await this.prisma.stockRequest.updateMany({
      where: { id, status: 'OPEN', ...(this.isStore(actor) ? {} : { requested_by_user_id: actor.id }) },
      data: { status: 'CANCELLED', closed_by_user_id: actor.id, closed_at: new Date() },
    });
    if (!closed.count) {
      throw new ConflictException('This request is no longer open.');
    }
    await this.audit.log({
      entity_type: 'stock_request',
      entity_id: id,
      action: 'STOCK_REQUEST_CANCELLED',
      actor_user_id: actor.id,
    });
    return this.get(id);
  }

  private async get(id: string) {
    const request = await this.prisma.stockRequest.findUniqueOrThrow({ where: { id } });
    return { ...request, lines: request.lines as RequestLine[] };
  }

  private isStore(actor: StockActor) {
    return Boolean(actor.access?.store);
  }
}
