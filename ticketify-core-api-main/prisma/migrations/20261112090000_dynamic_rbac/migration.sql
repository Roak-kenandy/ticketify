-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('NONE', 'VIEW', 'EDIT', 'DELETE');

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "description" TEXT,
ADD COLUMN     "field_technician" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "full_access" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_system" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stock_holder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "store" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "screen" VARCHAR(64) NOT NULL,
    "level" "AccessLevel" NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","screen")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "user_id" TEXT NOT NULL,
    "screen" VARCHAR(64) NOT NULL,
    "level" "AccessLevel" NOT NULL,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id","screen")
);

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing roles keep exactly the access they had when it was hard-coded.
UPDATE "roles" SET "is_system" = true, "full_access" = true
  WHERE lower("name") IN ('admin', 'administrator');
UPDATE "roles" SET "field_technician" = true WHERE lower("name") = 'technician';
UPDATE "roles" SET "stock_holder" = true WHERE lower("name") = 'supervisor';
UPDATE "roles" SET "store" = true WHERE lower("name") = 'inventory';

UPDATE "roles" SET "description" = CASE lower("name")
    WHEN 'admin' THEN 'Full access, including users and roles.'
    WHEN 'administrator' THEN 'Full access, including users and roles.'
    WHEN 'technician' THEN 'Works tickets in the technician app.'
    WHEN 'supervisor' THEN 'Runs dispatch and hands stock out to technicians.'
    WHEN 'ceo' THEN 'Read-only view of operations.'
    WHEN 'finance' THEN 'Finance overview and payments.'
    WHEN 'inventory' THEN 'The store: stock, consumption and item master.'
    ELSE "description" END
  WHERE "description" IS NULL;

INSERT INTO "role_permissions" ("role_id", "screen", "level")
SELECT r."id", p.screen, p.level::"AccessLevel"
FROM "roles" r
JOIN (VALUES
    ('technician', 'technician_app', 'VIEW'),

    ('supervisor', 'live_map', 'VIEW'),
    ('supervisor', 'dashboard', 'VIEW'),
    ('supervisor', 'operations_board', 'DELETE'),
    ('supervisor', 'auto_assign', 'EDIT'),
    ('supervisor', 'technician_app', 'VIEW'),
    ('supervisor', 'master_report', 'VIEW'),
    ('supervisor', 'ticket_aging', 'VIEW'),
    ('supervisor', 'finance_overview', 'EDIT'),
    ('supervisor', 'payments', 'VIEW'),
    ('supervisor', 'inventory_consumption', 'EDIT'),
    ('supervisor', 'stock', 'EDIT'),
    ('supervisor', 'stock_report', 'VIEW'),
    ('supervisor', 'item_master', 'VIEW'),
    ('supervisor', 'provisioning_log', 'VIEW'),
    ('supervisor', 'team_overview', 'VIEW'),
    ('supervisor', 'users', 'VIEW'),

    ('ceo', 'live_map', 'VIEW'),
    ('ceo', 'operations_board', 'VIEW'),
    ('ceo', 'provisioning_log', 'VIEW'),

    ('finance', 'finance_overview', 'EDIT'),
    ('finance', 'payments', 'VIEW'),

    ('inventory', 'inventory_consumption', 'EDIT'),
    ('inventory', 'stock', 'EDIT'),
    ('inventory', 'stock_report', 'VIEW'),
    ('inventory', 'item_master', 'VIEW')
) AS p(role_name, screen, level) ON lower(r."name") = p.role_name
WHERE r."deleted_at" IS NULL
ON CONFLICT DO NOTHING;
