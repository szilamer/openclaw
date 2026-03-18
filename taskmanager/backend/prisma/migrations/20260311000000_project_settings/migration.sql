-- Add new columns to projects
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "image" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "color" TEXT DEFAULT '#f59e0b';
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "knowledge_base" TEXT;

-- Create project_contacts table
CREATE TABLE IF NOT EXISTS "project_contacts" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "notes" TEXT,
    "is_external" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_contacts_pkey" PRIMARY KEY ("id")
);

-- Add foreign key
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'project_contacts_project_id_fkey'
    ) THEN
        ALTER TABLE "project_contacts"
            ADD CONSTRAINT "project_contacts_project_id_fkey"
            FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
