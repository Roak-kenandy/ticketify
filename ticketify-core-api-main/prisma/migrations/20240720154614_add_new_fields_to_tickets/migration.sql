/*
  Warnings:

  - You are about to drop the column `status` on the `Tickets` table. All the data in the column will be lost.
  - Added the required column `contact_id` to the `Tickets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contact_name` to the `Tickets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `impact` to the `Tickets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `number` to the `Tickets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `priority` to the `Tickets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `state` to the `Tickets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `urgency` to the `Tickets` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Tickets" DROP COLUMN "status",
ADD COLUMN     "contact_id" TEXT NOT NULL,
ADD COLUMN     "contact_name" TEXT NOT NULL,
ADD COLUMN     "impact" TEXT NOT NULL,
ADD COLUMN     "number" TEXT NOT NULL,
ADD COLUMN     "priority" TEXT NOT NULL,
ADD COLUMN     "state" TEXT NOT NULL,
ADD COLUMN     "urgency" TEXT NOT NULL;
