/*
  Warnings:

  - Added the required column `team_id` to the `UserTeams` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "UserTeams" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "team_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "crm_team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Team_crm_team_id_key" ON "Team"("crm_team_id");

-- AddForeignKey
ALTER TABLE "UserTeams" ADD CONSTRAINT "UserTeams_crm_team_id_fkey" FOREIGN KEY ("crm_team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
