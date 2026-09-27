-- CreateEnum
CREATE TYPE "TicketPaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ticket_payments" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "crm_ticket_id" TEXT NOT NULL,
    "amount_mvr" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MVR',
    "status" "TicketPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "bml_transaction_id" TEXT,
    "bml_state" TEXT,
    "payment_url" TEXT,
    "line_items" JSONB NOT NULL,
    "created_by_user_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_payments_reference_key" ON "ticket_payments"("reference");

-- CreateIndex
CREATE INDEX "ticket_payments_crm_ticket_id_idx" ON "ticket_payments"("crm_ticket_id");

-- CreateIndex
CREATE INDEX "ticket_payments_bml_transaction_id_idx" ON "ticket_payments"("bml_transaction_id");
