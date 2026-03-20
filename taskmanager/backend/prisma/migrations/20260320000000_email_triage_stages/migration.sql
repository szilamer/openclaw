-- AlterEnum: add 'irrelevant' to EmailTriageQueueStatus
ALTER TYPE "EmailTriageQueueStatus" ADD VALUE IF NOT EXISTS 'irrelevant' BEFORE 'pending_review';

-- Stage 1 (local LLM / Ollama) fields
ALTER TABLE "email_triage_queue" ADD COLUMN "stage1_classification" TEXT;
ALTER TABLE "email_triage_queue" ADD COLUMN "stage1_model" TEXT;
ALTER TABLE "email_triage_queue" ADD COLUMN "stage1_rationale" TEXT;
ALTER TABLE "email_triage_queue" ADD COLUMN "stage1_project_id" TEXT;

-- Human review correction reason
ALTER TABLE "email_triage_queue" ADD COLUMN "correction_reason" TEXT;

-- FK: stage1_project_id → projects(id)
ALTER TABLE "email_triage_queue"
  ADD CONSTRAINT "email_triage_queue_stage1_project_id_fkey"
  FOREIGN KEY ("stage1_project_id") REFERENCES "Project"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
