-- AlterTable
ALTER TABLE "user_location_tracking" ADD COLUMN     "accuracy" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "user_location_tracking_user_id_created_at_idx" ON "user_location_tracking"("user_id", "created_at" DESC);

