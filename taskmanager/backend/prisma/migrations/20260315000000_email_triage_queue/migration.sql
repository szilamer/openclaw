-- CreateEnum
CREATE TYPE "EmailTriageQueueStatus" AS ENUM ('fetched', 'pending_review', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "email_triage_queue" (
    "id" TEXT NOT NULL,
    "source_uid" TEXT NOT NULL,
    "mailbox" TEXT,
    "from_email" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_text" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "suggested_project_id" TEXT,
    "resolved_project_id" TEXT,
    "status" "EmailTriageQueueStatus" NOT NULL DEFAULT 'fetched',
    "llm_model" TEXT,
    "llm_rationale" TEXT,
    "task_id" TEXT,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_triage_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "triage_routing_rules" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT,
    "created_from_triage_id" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "triage_routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_triage_queue_source_uid_key" ON "email_triage_queue"("source_uid");

-- CreateIndex
CREATE UNIQUE INDEX "email_triage_queue_task_id_key" ON "email_triage_queue"("task_id");

-- CreateIndex
CREATE INDEX "triage_routing_rules_enabled_priority_idx" ON "triage_routing_rules"("enabled", "priority");

-- AddForeignKey
ALTER TABLE "email_triage_queue" ADD CONSTRAINT "email_triage_queue_suggested_project_id_fkey" FOREIGN KEY ("suggested_project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_triage_queue" ADD CONSTRAINT "email_triage_queue_resolved_project_id_fkey" FOREIGN KEY ("resolved_project_id") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_triage_queue" ADD CONSTRAINT "email_triage_queue_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_triage_queue" ADD CONSTRAINT "email_triage_queue_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "triage_routing_rules" ADD CONSTRAINT "triage_routing_rules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
