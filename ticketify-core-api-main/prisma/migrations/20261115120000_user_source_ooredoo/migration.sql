-- CreateEnum
CREATE TYPE "UserSource" AS ENUM ('MEDIANET', 'OOREDOO');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "source" "UserSource" NOT NULL DEFAULT 'MEDIANET';
ALTER TABLE "users" ADD COLUMN "ooredoo_user_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_ooredoo_user_id_key" ON "users"("ooredoo_user_id");
