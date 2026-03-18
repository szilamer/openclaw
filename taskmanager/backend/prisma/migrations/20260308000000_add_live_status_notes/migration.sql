-- AlterTable
ALTER TABLE "Task" ADD COLUMN "live_status" TEXT;
ALTER TABLE "Task" ADD COLUMN "live_status_updated_at" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "notes" TEXT;
