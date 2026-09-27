-- CreateEnum
CREATE TYPE "TechnicianPresence" AS ENUM ('ONLINE', 'BUSY', 'OFFLINE');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "busy_comment" TEXT,
ADD COLUMN     "busy_until" TIMESTAMP(3),
ADD COLUMN     "presence" "TechnicianPresence" NOT NULL DEFAULT 'OFFLINE';

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "trigger_key" TEXT NOT NULL,
    "body_template" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charge_catalog_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount_mvr" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "charge_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_schedules" (
    "id" TEXT NOT NULL,
    "crm_ticket_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "technician_user_id" TEXT NOT NULL,
    "sms_sent" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_policies" (
    "id" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "region" TEXT,
    "queue_id" TEXT,
    "mode" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "assignment_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_audit_logs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "old_state" JSONB,
    "new_state" JSONB,
    "crm_sync_ok" BOOLEAN,
    "error_message" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_trigger_key_key" ON "notification_templates"("trigger_key");

-- CreateIndex
CREATE UNIQUE INDEX "charge_catalog_items_code_key" ON "charge_catalog_items"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_schedules_idempotency_key_key" ON "ticket_schedules"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "integration_audit_logs_idempotency_key_key" ON "integration_audit_logs"("idempotency_key");
