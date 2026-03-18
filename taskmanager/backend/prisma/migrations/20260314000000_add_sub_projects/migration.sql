-- CreateEnum
CREATE TYPE "SubProjectStatus" AS ENUM ('active', 'completed', 'archived');

-- CreateTable
CREATE TABLE "sub_projects" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#3b82f6',
    "status" "SubProjectStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sub_projects_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "Task" ADD COLUMN "sub_project_id" TEXT;

-- CreateIndex
CREATE INDEX "sub_projects_project_id_idx" ON "sub_projects"("project_id");

-- CreateIndex
CREATE INDEX "Task_sub_project_id_idx" ON "Task"("sub_project_id");

-- AddForeignKey
ALTER TABLE "sub_projects" ADD CONSTRAINT "sub_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sub_project_id_fkey" FOREIGN KEY ("sub_project_id") REFERENCES "sub_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
