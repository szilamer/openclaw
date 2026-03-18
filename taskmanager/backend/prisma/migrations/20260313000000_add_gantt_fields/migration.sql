-- AlterTable
ALTER TABLE "Task" ADD COLUMN "start_at" TIMESTAMP(3),
ADD COLUMN "estimated_hours" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" TEXT NOT NULL,
    "dependent_id" TEXT NOT NULL,
    "prerequisite_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_dependent_id_prerequisite_id_key" ON "task_dependencies"("dependent_id", "prerequisite_id");

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_dependent_id_fkey" FOREIGN KEY ("dependent_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_prerequisite_id_fkey" FOREIGN KEY ("prerequisite_id") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
