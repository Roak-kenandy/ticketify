-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ISSUE', 'RETURN');

-- CreateEnum
CREATE TYPE "StockReturnCondition" AS ENUM ('GOOD', 'FAULTY');

-- CreateEnum
CREATE TYPE "SerialUnitStatus" AS ENUM ('WITH_TECHNICIAN', 'CONSUMED', 'RETURNED', 'FAULTY');

-- AlterTable
ALTER TABLE "ticket_inventory_consumptions" ADD COLUMN     "stock_tracked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "technician_stock_movements" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "technician_user_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "uom" TEXT NOT NULL,
    "serial_number" TEXT,
    "condition" "StockReturnCondition",
    "reference" TEXT,
    "notes" TEXT,
    "performed_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "serial_units" (
    "id" TEXT NOT NULL,
    "serial_number" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "status" "SerialUnitStatus" NOT NULL,
    "technician_user_id" TEXT,
    "consumption_id" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "serial_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "technician_stock_movements_technician_user_id_item_id_idx" ON "technician_stock_movements"("technician_user_id", "item_id");

-- CreateIndex
CREATE INDEX "technician_stock_movements_created_at_idx" ON "technician_stock_movements"("created_at");

-- CreateIndex
CREATE INDEX "technician_stock_movements_batch_id_idx" ON "technician_stock_movements"("batch_id");

-- CreateIndex
CREATE INDEX "technician_stock_movements_serial_number_idx" ON "technician_stock_movements"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "serial_units_serial_number_key" ON "serial_units"("serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "serial_units_consumption_id_key" ON "serial_units"("consumption_id");

-- CreateIndex
CREATE INDEX "serial_units_technician_user_id_status_idx" ON "serial_units"("technician_user_id", "status");

-- AddForeignKey
ALTER TABLE "technician_stock_movements" ADD CONSTRAINT "technician_stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_units" ADD CONSTRAINT "serial_units_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

