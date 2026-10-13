import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryItem, Prisma } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { IntegrationAuditService } from 'src/infrastructure/audit/integration-audit.service';
import { InventoryItemDto, InventoryItemUpdateDto } from './dto/inventory.dto';

export type InventoryItemView = Omit<InventoryItem, 'conversion_factor'> & {
  conversion_factor: number;
};

@Injectable()
export class InventoryItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: IntegrationAuditService,
  ) {}

  async list(includeInactive = false): Promise<InventoryItemView[]> {
    const items = await this.prisma.inventoryItem.findMany({
      where: includeInactive ? undefined : { active: true },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
    });
    return items.map(toView);
  }

  async get(id: string): Promise<InventoryItemView> {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Inventory item not found');
    return toView(item);
  }

  async findActive(id: string): Promise<InventoryItem> {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item || !item.active) {
      throw new NotFoundException('Inventory item not found or inactive');
    }
    return item;
  }

  async create(dto: InventoryItemDto, actorUserId: string) {
    try {
      const item = await this.prisma.inventoryItem.create({
        data: {
          ...this.normalize(dto),
          code: dto.code,
          name: dto.name.trim(),
          category: dto.category.trim(),
          stock_uom: dto.stock_uom.trim(),
          consumption_uom: dto.consumption_uom.trim(),
        },
      });
      await this.audit.log({
        entity_type: 'inventory_item',
        entity_id: item.id,
        action: 'INVENTORY_ITEM_CREATED',
        actor_user_id: actorUserId,
        new_state: toView(item),
      });
      return toView(item);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Item code ${dto.code} already exists`);
      }
      throw error;
    }
  }

  async update(id: string, dto: InventoryItemUpdateDto, actorUserId: string) {
    const before = await this.prisma.inventoryItem.findUnique({
      where: { id },
    });
    if (!before) {
      throw new NotFoundException('Inventory item not found');
    }
    const item = await this.prisma.inventoryItem.update({
      where: { id },
      data: this.normalize(dto),
    });
    await this.audit.log({
      entity_type: 'inventory_item',
      entity_id: id,
      action: 'INVENTORY_ITEM_UPDATED',
      actor_user_id: actorUserId,
      old_state: toView(before),
      new_state: toView(item),
    });
    return toView(item);
  }

  private normalize(dto: InventoryItemUpdateDto) {
    const trim = (value?: string) =>
      value === undefined ? undefined : value.trim();
    const serialized = dto.serialized;
    return {
      name: trim(dto.name),
      category: trim(dto.category),
      stock_uom: trim(dto.stock_uom),
      consumption_uom: trim(dto.consumption_uom),
      conversion_factor: dto.conversion_factor,
      serialized,
      // A serialized device is always one whole unit per serial.
      allow_decimal: serialized ? false : dto.allow_decimal,
      remarks_required: dto.remarks_required,
      active: dto.active,
      notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
      sort_order: dto.sort_order,
    };
  }
}

export function toView(item: InventoryItem): InventoryItemView {
  return { ...item, conversion_factor: Number(item.conversion_factor) };
}
