-- Add kb_file_name and kb_synced_at columns to Project
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "kb_file_name" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "kb_synced_at" TIMESTAMP(3);
