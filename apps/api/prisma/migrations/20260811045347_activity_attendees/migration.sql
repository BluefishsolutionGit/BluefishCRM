-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "attendees" TEXT[] DEFAULT ARRAY[]::TEXT[];
