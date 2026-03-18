-- Clean up any remnants from previous attempts
ALTER TABLE "Task" DROP CONSTRAINT IF EXISTS "Task_short_id_key";
ALTER TABLE "Task" DROP COLUMN IF EXISTS "short_id";
DROP SEQUENCE IF EXISTS "task_short_id_seq";
DROP SEQUENCE IF EXISTS "Task_short_id_seq";

-- Create fresh sequence
CREATE SEQUENCE "Task_short_id_seq";

-- Add integer short_id column
ALTER TABLE "Task" ADD COLUMN "short_id" INTEGER;

-- Backfill existing tasks ordered by creation date
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM "Task"
)
UPDATE "Task" SET "short_id" = numbered.rn
FROM numbered WHERE "Task".id = numbered.id;

-- Set sequence to continue after the max existing value
SELECT setval('"Task_short_id_seq"', COALESCE((SELECT MAX("short_id") FROM "Task"), 0));

-- Now make it NOT NULL with default
ALTER TABLE "Task" ALTER COLUMN "short_id" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "short_id" SET DEFAULT nextval('"Task_short_id_seq"');

-- Add unique constraint
ALTER TABLE "Task" ADD CONSTRAINT "Task_short_id_key" UNIQUE ("short_id");
