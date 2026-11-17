-- CreateTable
CREATE TABLE "fms_ticket_assignments" (
    "fms_ticket_id" TEXT NOT NULL,
    "ooredoo_user_id" TEXT NOT NULL,
    "assignee_email" TEXT,
    "assigned_by_user_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fms_ticket_assignments_pkey" PRIMARY KEY ("fms_ticket_id")
);

-- CreateIndex
CREATE INDEX "fms_ticket_assignments_ooredoo_user_id_idx" ON "fms_ticket_assignments"("ooredoo_user_id");
