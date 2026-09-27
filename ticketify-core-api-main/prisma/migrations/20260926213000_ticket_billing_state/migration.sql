-- CreateEnum
CREATE TYPE "TicketBillingDecision" AS ENUM ('UNDECIDED', 'NOT_CHARGEABLE', 'CHARGEABLE');

-- CreateTable
CREATE TABLE "ticket_billing_states" (
    "id" TEXT NOT NULL,
    "crm_ticket_id" TEXT NOT NULL,
    "decision" "TicketBillingDecision" NOT NULL DEFAULT 'UNDECIDED',
    "decided_by_user_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_billing_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_billing_states_crm_ticket_id_key" ON "ticket_billing_states"("crm_ticket_id");
