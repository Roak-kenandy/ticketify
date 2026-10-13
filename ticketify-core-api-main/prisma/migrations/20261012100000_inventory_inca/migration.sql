-- CreateEnum
CREATE TYPE "InventoryDeclarationType" AS ENUM ('USED', 'NONE_USED');

-- CreateEnum
CREATE TYPE "InventoryConsumptionStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ProvisioningAction" AS ENUM ('NEW_CONNECTION', 'ONT_REPLACEMENT', 'RELOCATION', 'SIGNAL_CHECK');

-- CreateEnum
CREATE TYPE "ProvisioningStatus" AS ENUM ('VALIDATING', 'REGISTERING_ONT', 'APPLYING_CONFIG', 'WAITING_TODO', 'VERIFYING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "stock_uom" TEXT NOT NULL,
    "consumption_uom" TEXT NOT NULL,
    "conversion_factor" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "serialized" BOOLEAN NOT NULL DEFAULT false,
    "allow_decimal" BOOLEAN NOT NULL DEFAULT false,
    "remarks_required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_inventory_declarations" (
    "id" TEXT NOT NULL,
    "crm_ticket_id" TEXT NOT NULL,
    "sr_number" TEXT,
    "declaration" "InventoryDeclarationType" NOT NULL,
    "declared_by_user_id" TEXT NOT NULL,
    "department" TEXT,
    "service_type" TEXT,
    "area" TEXT,
    "customer_name" TEXT,
    "declared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_inventory_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_inventory_consumptions" (
    "id" TEXT NOT NULL,
    "crm_ticket_id" TEXT NOT NULL,
    "sr_number" TEXT,
    "item_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "uom" TEXT NOT NULL,
    "serial_number" TEXT,
    "remarks" TEXT,
    "technician_user_id" TEXT NOT NULL,
    "department" TEXT,
    "service_type" TEXT,
    "area" TEXT,
    "customer_name" TEXT,
    "provisioning_transaction_id" TEXT,
    "status" "InventoryConsumptionStatus" NOT NULL DEFAULT 'POSTED',
    "idempotency_key" TEXT,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_inventory_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" TEXT NOT NULL,
    "consumption_id" TEXT NOT NULL,
    "quantity_delta" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "approved_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provisioning_transactions" (
    "id" TEXT NOT NULL,
    "crm_ticket_id" TEXT NOT NULL,
    "sr_number" TEXT,
    "action" "ProvisioningAction" NOT NULL,
    "status" "ProvisioningStatus" NOT NULL DEFAULT 'VALIDATING',
    "technician_user_id" TEXT NOT NULL,
    "submitted" JSONB NOT NULL,
    "result" JSONB,
    "ont_serial" TEXT,
    "old_ont_serial" TEXT,
    "installs_ont" BOOLEAN NOT NULL DEFAULT false,
    "failed_stage" TEXT,
    "error_message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provisioning_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provisioning_steps" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provisioning_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_code_key" ON "inventory_items"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_inventory_declarations_crm_ticket_id_key" ON "ticket_inventory_declarations"("crm_ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_inventory_consumptions_idempotency_key_key" ON "ticket_inventory_consumptions"("idempotency_key");

-- CreateIndex
CREATE INDEX "ticket_inventory_consumptions_crm_ticket_id_idx" ON "ticket_inventory_consumptions"("crm_ticket_id");

-- CreateIndex
CREATE INDEX "ticket_inventory_consumptions_posted_at_idx" ON "ticket_inventory_consumptions"("posted_at");

-- CreateIndex
CREATE INDEX "ticket_inventory_consumptions_technician_user_id_idx" ON "ticket_inventory_consumptions"("technician_user_id");

-- CreateIndex
CREATE INDEX "ticket_inventory_consumptions_item_id_idx" ON "ticket_inventory_consumptions"("item_id");

-- CreateIndex
CREATE INDEX "inventory_adjustments_consumption_id_idx" ON "inventory_adjustments"("consumption_id");

-- CreateIndex
CREATE INDEX "provisioning_transactions_crm_ticket_id_idx" ON "provisioning_transactions"("crm_ticket_id");

-- CreateIndex
CREATE INDEX "provisioning_transactions_status_idx" ON "provisioning_transactions"("status");

-- CreateIndex
CREATE INDEX "provisioning_transactions_started_at_idx" ON "provisioning_transactions"("started_at");

-- CreateIndex
CREATE INDEX "provisioning_steps_transaction_id_idx" ON "provisioning_steps"("transaction_id");

-- AddForeignKey
ALTER TABLE "ticket_inventory_consumptions" ADD CONSTRAINT "ticket_inventory_consumptions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_consumption_id_fkey" FOREIGN KEY ("consumption_id") REFERENCES "ticket_inventory_consumptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisioning_steps" ADD CONSTRAINT "provisioning_steps_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "provisioning_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

