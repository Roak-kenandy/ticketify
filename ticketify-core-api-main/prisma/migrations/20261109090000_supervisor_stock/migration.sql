-- AlterEnum
ALTER TYPE "SerialUnitStatus" ADD VALUE 'WITH_SUPERVISOR' BEFORE 'WITH_TECHNICIAN';

-- CreateEnum
CREATE TYPE "StockRequestStatus" AS ENUM ('OPEN', 'FULFILLED', 'CANCELLED');

-- AlterTable
ALTER TABLE "technician_stock_movements" ADD COLUMN     "counterparty_user_id" TEXT;

-- CreateTable
CREATE TABLE "stock_requests" (
    "id" TEXT NOT NULL,
    "requested_by_user_id" TEXT NOT NULL,
    "status" "StockRequestStatus" NOT NULL DEFAULT 'OPEN',
    "lines" JSONB NOT NULL,
    "notes" TEXT,
    "fulfilled_batch_id" TEXT,
    "closed_by_user_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "technician_stock_movements_counterparty_user_id_item_id_idx" ON "technician_stock_movements"("counterparty_user_id", "item_id");

-- CreateIndex
CREATE INDEX "stock_requests_status_created_at_idx" ON "stock_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "stock_requests_requested_by_user_id_idx" ON "stock_requests"("requested_by_user_id");
