/*
  Warnings:

  - You are about to drop the `teams` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_teams` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "user_teams" DROP CONSTRAINT "user_teams_crm_team_id_fkey";

-- DropForeignKey
ALTER TABLE "user_teams" DROP CONSTRAINT "user_teams_crm_user_id_fkey";

-- DropTable
DROP TABLE "teams";

-- DropTable
DROP TABLE "user_teams";
