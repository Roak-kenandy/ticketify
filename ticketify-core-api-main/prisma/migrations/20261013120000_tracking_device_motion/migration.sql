-- AlterTable
ALTER TABLE "tracking_devices" ADD COLUMN "is_moving" BOOLEAN,
ADD COLUMN "motion_since" TIMESTAMP(3),
ADD COLUMN "battery_level" INTEGER,
ADD COLUMN "is_charging" BOOLEAN;
