import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();
import * as argon from 'argon2';

let roles: Role[] = [
  {
    name: 'Admin',
    id: '1',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  },
  {
    name: 'Technician',
    id: '2',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  },
  {
    name: 'Supervisor',
    id: '3',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  },
  {
    name: 'CEO',
    id: '4',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  },
  {
    name: 'Finance',
    id: '5',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  },
];

async function main() {
  for (let role of roles) {
    await prisma.role.create({
      data: role,
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
      password: await argon.hash('RND@d3v3214'), // hashed password
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
      password: await argon.hash('Medianet@123'),
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
      password: await argon.hash('Medianet@123'),
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
