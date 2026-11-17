-- Medianet co-tech helpers on a single CRM ticket (CRM assignee stays primary).
CREATE TABLE "ticket_helpers" (
    "id" TEXT NOT NULL,
    "crm_ticket_id" TEXT NOT NULL,
    "helper_user_id" TEXT NOT NULL,
    "added_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_helpers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_helpers_crm_ticket_id_helper_user_id_key" ON "ticket_helpers"("crm_ticket_id", "helper_user_id");
CREATE INDEX "ticket_helpers_helper_user_id_idx" ON "ticket_helpers"("helper_user_id");
CREATE INDEX "ticket_helpers_crm_ticket_id_idx" ON "ticket_helpers"("crm_ticket_id");

ALTER TABLE "ticket_helpers" ADD CONSTRAINT "ticket_helpers_helper_user_id_fkey" FOREIGN KEY ("helper_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_helpers" ADD CONSTRAINT "ticket_helpers_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
