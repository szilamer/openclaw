-- CreateEnum
CREATE TYPE "PlanningStatus" AS ENUM ('none', 'pending', 'triggered', 'in_progress', 'completed', 'failed');

-- AlterTable
ALTER TABLE "sub_projects" ADD COLUMN "requirements" TEXT;
ALTER TABLE "sub_projects" ADD COLUMN "planning_status" "PlanningStatus" NOT NULL DEFAULT 'none';
ALTER TABLE "sub_projects" ADD COLUMN "planning_task_id" TEXT;
