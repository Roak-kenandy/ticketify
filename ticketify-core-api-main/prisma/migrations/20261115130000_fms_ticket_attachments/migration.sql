-- CreateTable
CREATE TABLE "fms_ticket_attachments" (
    "id" TEXT NOT NULL,
    "fms_ticket_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fms_ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fms_ticket_attachments_fms_ticket_id_idx" ON "fms_ticket_attachments"("fms_ticket_id");
