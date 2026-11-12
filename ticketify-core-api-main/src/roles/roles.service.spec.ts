import { BadRequestException, ConflictException } from '@nestjs/common';
import { RolesService } from './roles.service';

const role = (overrides: Record<string, unknown> = {}) => ({
  id: 'r1',
  name: 'Finance',
  description: null,
  is_system: false,
  full_access: false,
  field_technician: false,
  stock_holder: false,
  store: false,
  permissions: [{ screen: 'payments', level: 'VIEW' }],
  _count: { User: 0 },
  ...overrides,
});

function build(found = role(), { clash = false, fullUsers = 1 } = {}) {
  const tx = {
    rolePermission: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    userPermission: { deleteMany: jest.fn() },
    role: { update: jest.fn(async ({ data }) => ({ ...found, ...data })) },
  };
  const prisma = {
    role: {
      findFirst: jest.fn(async ({ where }) =>
        'name' in where ? (clash ? { id: 'other' } : null) : found,
      ),
      create: jest.fn(async ({ data }) => ({
        ...role(),
        ...data,
        permissions: data.permissions.create,
      })),
      update: jest.fn(),
    },
    rolePermission: { deleteMany: jest.fn() },
    user: { count: jest.fn().mockResolvedValue(fullUsers) },
    $transaction: jest.fn(async (arg) =>
      typeof arg === 'function' ? arg(tx) : Promise.all(arg),
    ),
  };
  const service = new RolesService(
    prisma as never,
    { log: jest.fn() } as never,
  );
  return { service, prisma, tx };
}

describe('RolesService', () => {
  it('creates a role with capped screen levels', async () => {
    const { service, prisma } = build();
    prisma.role.findFirst.mockResolvedValueOnce(null);
    const created = await service.create({
      name: ' Billing ',
      permissions: [{ screen: 'payments', level: 'DELETE' }],
    });
    expect(prisma.role.create.mock.calls[0][0].data).toMatchObject({
      name: 'Billing',
      permissions: { create: [{ screen: 'payments', level: 'VIEW' }] },
    });
    expect(created.user_count).toBe(0);
  });

  it('refuses a duplicate name', async () => {
    const { service } = build(role(), { clash: true });
    await expect(service.create({ name: 'finance' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('locks built-in roles except their description', async () => {
    const { service } = build(role({ is_system: true, full_access: true }));
    await expect(service.update('r1', { full_access: false })).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.update('r1', { description: 'Owners' }),
    ).resolves.toMatchObject({
      description: 'Owners',
    });
  });

  it('will not remove full access from the last full-access users', async () => {
    const { service } = build(role({ full_access: true, permissions: [] }), {
      fullUsers: 0,
    });
    await expect(service.update('r1', { full_access: false })).rejects.toThrow(
      /full access/,
    );
  });

  it('drops user overrides for screens the role loses', async () => {
    const { service, tx } = build();
    await service.update('r1', {
      permissions: [{ screen: 'finance_overview', level: 'EDIT' }],
    });
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith({
      data: [{ screen: 'finance_overview', level: 'EDIT', role_id: 'r1' }],
    });
    expect(tx.userPermission.deleteMany).toHaveBeenCalled();
  });

  it('only deletes custom roles with nobody on them', async () => {
    await expect(
      build(role({ is_system: true })).service.remove('r1'),
    ).rejects.toThrow(/Built-in/);
    await expect(
      build(role({ _count: { User: 2 } })).service.remove('r1'),
    ).rejects.toThrow(/2 users/);
    const { service, prisma } = build();
    await service.remove('r1');
    expect(prisma.role.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { deleted_at: expect.any(Date) },
    });
  });
});
