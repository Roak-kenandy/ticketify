import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { LoggerService } from 'src/infrastructure/logger/logger.service';
import { normalizeRolePermissions } from 'src/auth/access/permissions';
import { ACCESS_LEVELS, SCREENS } from 'src/auth/access/screens';
import { RoleDto, UpdateRoleDto } from './dto/role.dto';

const ROLE_SELECT = {
  id: true,
  name: true,
  description: true,
  is_system: true,
  full_access: true,
  field_technician: true,
  stock_holder: true,
  store: true,
  permissions: { select: { screen: true, level: true } },
  _count: { select: { User: true } },
} satisfies Prisma.RoleSelect;

type RoleRow = Prisma.RoleGetPayload<{ select: typeof ROLE_SELECT }>;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  catalogue() {
    return { levels: ACCESS_LEVELS, screens: SCREENS };
  }

  async list() {
    const roles = await this.prisma.role.findMany({
      where: { deleted_at: null },
      select: ROLE_SELECT,
      orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
    });
    return roles.map(present);
  }

  async get(id: string) {
    return present(await this.find(id));
  }

  async create(dto: RoleDto) {
    const name = dto.name.trim();
    await this.assertNameFree(name);
    const permissions = dto.full_access
      ? []
      : normalizeRolePermissions(dto.permissions);
    const role = await this.prisma.role.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        full_access: Boolean(dto.full_access),
        field_technician: Boolean(dto.field_technician),
        stock_holder: Boolean(dto.stock_holder),
        store: Boolean(dto.store),
        permissions: { create: permissions },
      },
      select: ROLE_SELECT,
    });
    this.logger.log('RolesService', `Role created ${role.id} (${role.name})`);
    return present(role);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.find(id);
    if (role.is_system) {
      const changed = Object.keys(dto).filter(
        (key) =>
          key !== 'description' &&
          dto[key as keyof UpdateRoleDto] !== undefined,
      );
      if (changed.length) {
        throw new BadRequestException(
          'Built-in roles are locked; only the description can be changed',
        );
      }
    }
    const name = dto.name?.trim();
    if (name && name.toLowerCase() !== role.name.toLowerCase()) {
      await this.assertNameFree(name, id);
    }
    const fullAccess = dto.full_access ?? role.full_access;
    if (role.full_access && !fullAccess) {
      await this.assertOtherFullAccessUsers(id);
    }
    const replacePermissions = fullAccess
      ? role.permissions.length > 0
      : dto.permissions !== undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (replacePermissions) {
        await tx.rolePermission.deleteMany({ where: { role_id: id } });
        const permissions = fullAccess
          ? []
          : normalizeRolePermissions(dto.permissions);
        if (permissions.length) {
          await tx.rolePermission.createMany({
            data: permissions.map((p) => ({ ...p, role_id: id })),
          });
        }
        await this.dropOrphanOverrides(tx, id);
      }
      return tx.role.update({
        where: { id },
        data: {
          name,
          description:
            dto.description === undefined
              ? undefined
              : dto.description.trim() || null,
          full_access: dto.full_access,
          field_technician: dto.field_technician,
          stock_holder: dto.stock_holder,
          store: dto.store,
        },
        select: ROLE_SELECT,
      });
    });
    this.logger.log('RolesService', `Role updated ${id} (${updated.name})`);
    return present(updated);
  }

  async remove(id: string) {
    const role = await this.find(id);
    if (role.is_system) {
      throw new BadRequestException('Built-in roles cannot be deleted');
    }
    if (role._count.User > 0) {
      throw new BadRequestException(
        `Move the ${role._count.User} user${role._count.User === 1 ? '' : 's'} on this role to another role first`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role_id: id } }),
      this.prisma.role.update({
        where: { id },
        data: { deleted_at: new Date() },
      }),
    ]);
    this.logger.log('RolesService', `Role deleted ${id} (${role.name})`);
    return { message: 'Role deleted' };
  }

  private async find(id: string): Promise<RoleRow> {
    const role = await this.prisma.role.findFirst({
      where: { id, deleted_at: null },
      select: ROLE_SELECT,
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.role.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        deleted_at: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash)
      throw new ConflictException('A role with this name already exists');
  }

  /** Someone must still be able to manage roles after the change. */
  private async assertOtherFullAccessUsers(roleId: string) {
    const others = await this.prisma.user.count({
      where: {
        is_active: true,
        role: { full_access: true, deleted_at: null, id: { not: roleId } },
      },
    });
    if (!others) {
      throw new BadRequestException(
        'At least one active user must keep full access',
      );
    }
  }

  /** User overrides only apply to the role's screens; drop the rest. */
  private async dropOrphanOverrides(
    tx: Prisma.TransactionClient,
    roleId: string,
  ) {
    const screens = (
      await tx.rolePermission.findMany({
        where: { role_id: roleId },
        select: { screen: true },
      })
    ).map((p) => p.screen);
    await tx.userPermission.deleteMany({
      where: { user: { role_id: roleId }, screen: { notIn: screens } },
    });
  }
}

function present(role: RoleRow) {
  const { _count, ...rest } = role;
  return { ...rest, user_count: _count.User };
}
