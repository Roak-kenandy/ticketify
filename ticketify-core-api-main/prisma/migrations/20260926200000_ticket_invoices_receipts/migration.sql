-- CreateEnum
CREATE TYPE "TicketInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID');

-- AlterTable
ALTER TABLE "ticket_payments" ADD COLUMN     "invoice_id" TEXT,
ADD COLUMN     "subtotal_mvr" DECIMAL(10,2),
ADD COLUMN     "tax_mvr" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "ticket_invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "crm_ticket_id" TEXT NOT NULL,
    "sr_number" TEXT,
    "status" "TicketInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotal_mvr" DECIMAL(10,2) NOT NULL,
    "tax_mvr" DECIMAL(10,2) NOT NULL,
    "total_mvr" DECIMAL(10,2) NOT NULL,
    "gst_rate" DECIMAL(5,4) NOT NULL,
    "line_items" JSONB NOT NULL,
    "created_by_user_id" TEXT,
    "issued_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_receipts" (
    "id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "crm_ticket_id" TEXT NOT NULL,
    "sr_number" TEXT,
    "subtotal_mvr" DECIMAL(10,2) NOT NULL,
    "tax_mvr" DECIMAL(10,2) NOT NULL,
    "amount_paid_mvr" DECIMAL(10,2) NOT NULL,
    "line_items" JSONB NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB,

    CONSTRAINT "ticket_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_invoices_invoice_number_key" ON "ticket_invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "ticket_invoices_crm_ticket_id_idx" ON "ticket_invoices"("crm_ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_receipts_receipt_number_key" ON "ticket_receipts"("receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_receipts_invoice_id_key" ON "ticket_receipts"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_receipts_payment_id_key" ON "ticket_receipts"("payment_id");

-- CreateIndex
CREATE INDEX "ticket_receipts_crm_ticket_id_idx" ON "ticket_receipts"("crm_ticket_id");

-- CreateIndex
CREATE INDEX "ticket_payments_invoice_id_idx" ON "ticket_payments"("invoice_id");

-- AddForeignKey
ALTER TABLE "ticket_payments" ADD CONSTRAINT "ticket_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ticket_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_receipts" ADD CONSTRAINT "ticket_receipts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "ticket_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_receipts" ADD CONSTRAINT "ticket_receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "ticket_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
