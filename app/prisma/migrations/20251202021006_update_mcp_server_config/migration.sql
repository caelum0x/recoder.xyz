-- AlterTable MCPServer: Consolidate command, args, env into config JSON field
-- Add updatedAt field for tracking changes

-- Step 1: Add new columns
ALTER TABLE "MCPServer" ADD COLUMN IF NOT EXISTS "config" JSONB;
ALTER TABLE "MCPServer" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Step 2: Migrate existing data to config field
UPDATE "MCPServer" 
SET "config" = jsonb_build_object(
  'id', "serverId",
  'name', "name",
  'command', "command",
  'args', "args",
  'env', COALESCE("env", '{}'::jsonb)
)
WHERE "config" IS NULL;

-- Step 3: Drop old columns (only if config is populated)
ALTER TABLE "MCPServer" DROP COLUMN IF EXISTS "command";
ALTER TABLE "MCPServer" DROP COLUMN IF EXISTS "args";
ALTER TABLE "MCPServer" DROP COLUMN IF EXISTS "env";

-- Step 4: Make config NOT NULL
ALTER TABLE "MCPServer" ALTER COLUMN "config" SET NOT NULL;
