/*
  Warnings:

  - You are about to drop the column `contact_name` on the `Tickets` table. All the data in the column will be lost.
  - You are about to drop the column `impact` on the `Tickets` table. All the data in the column will be lost.
  - You are about to drop the column `urgency` on the `Tickets` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Tickets" DROP COLUMN "contact_name",
DROP COLUMN "impact",
DROP COLUMN "urgency";
