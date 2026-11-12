import { AccessLevel, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
import * as argon from 'argon2';

function seedPassword(envName: string): string {
  const value = process.env[envName]?.trim();
  if (!value || value.length < 8) {
    throw new Error(
      `${envName} must be set (min 8 characters) before seeding users`,
    );
  }
  return value;
}

type SeedRole = {
  id: string;
  name: string;
  description: string;
  is_system?: boolean;
  full_access?: boolean;
  field_technician?: boolean;
  stock_holder?: boolean;
  store?: boolean;
  permissions?: Record<string, AccessLevel>;
};

/** Same setup as the dynamic_rbac migration gives existing databases. */
const roles: SeedRole[] = [
  {
    id: '1',
    name: 'Admin',
    description: 'Full access to every screen, roles and users',
    is_system: true,
    full_access: true,
  },
  {
    id: '2',
    name: 'Technician',
    description: 'Works assigned tickets in the technician app',
    field_technician: true,
    permissions: { technician_app: 'VIEW' },
  },
  {
    id: '3',
    name: 'Supervisor',
    description: 'Runs operations, holds stock and hands it out to technicians',
    stock_holder: true,
    permissions: {
      live_map: 'VIEW',
      dashboard: 'VIEW',
      operations_board: 'DELETE',
      auto_assign: 'EDIT',
      technician_app: 'VIEW',
      master_report: 'VIEW',
      ticket_aging: 'VIEW',
      finance_overview: 'EDIT',
      payments: 'VIEW',
      inventory_consumption: 'EDIT',
      stock: 'EDIT',
      stock_report: 'VIEW',
      item_master: 'VIEW',
      provisioning_log: 'VIEW',
      team_overview: 'VIEW',
      users: 'VIEW',
    },
  },
  {
    id: '4',
    name: 'CEO',
    description: 'Read-only view of live operations',
    permissions: { live_map: 'VIEW', operations_board: 'VIEW', provisioning_log: 'VIEW' },
  },
  {
    id: '5',
    name: 'Finance',
    description: 'Payments and finance reports',
    permissions: { finance_overview: 'EDIT', payments: 'VIEW' },
  },
];

async function main() {
  for (const { permissions = {}, ...role } of roles) {
    await prisma.role.create({
      data: {
        ...role,
        permissions: {
          create: Object.entries(permissions).map(([screen, level]) => ({ screen, level })),
        },
      },
    });
  }

  // create a super admin user
  await prisma.user.create({
    data: {
      role: {
        connect: {
          id: '1', // Admin role
        },
      },
      name: 'Hussain Siraj',
      email: 'it@medianet.mv',
      password: await argon.hash(seedPassword('SEED_ADMIN_PASSWORD')), // hashed password
      crm_user_id: '04fc5b36-e8dc-4879-bf1e-795f20c20f6b', // replace with actual CRM user ID
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  await prisma.user.create({
    data: {
      role: { connect: { id: '1' } },
      name: 'RND Admin',
      email: 'rnd@medianet.mv',
      password: await argon.hash(seedPassword('SEED_RND_PASSWORD')),
      crm_user_id: 'rnd-admin-seed-user-id',
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  await prisma.user.create({
    data: {
      role: { connect: { id: '5' } },
      name: 'Finance',
      email: 'finance@medianet.mv',
      password: await argon.hash(seedPassword('SEED_FINANCE_PASSWORD')),
      crm_user_id: 'finance-seed-user-id',
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
}

main()
  .catch((e) => {
    console.log(e);
    throw e;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
