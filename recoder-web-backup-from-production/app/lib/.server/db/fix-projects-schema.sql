-- Fix projects table schema
-- This ensures the projects table matches the code expectations

-- Drop existing projects table if it has wrong schema
DROP TABLE IF EXISTS projects CASCADE;

-- Create projects table with correct schema
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,  -- Changed to TEXT to match any user ID format
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) DEFAULT 'web',
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  config JSONB DEFAULT '{}',
  structure JSONB,
  framework VARCHAR(100),
  language VARCHAR(100),
  "isPrivate" BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  "projectPath" TEXT,
  "templateId" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_projects_userId ON projects("userId");
CREATE INDEX IF NOT EXISTS idx_projects_updatedAt ON projects("updatedAt" DESC);
CREATE INDEX IF NOT EXISTS idx_projects_isPrivate ON projects("isPrivate");

-- Update chat_sessions to reference projects correctly
ALTER TABLE IF EXISTS chat_sessions 
  DROP CONSTRAINT IF EXISTS chat_sessions_project_id_fkey;

ALTER TABLE IF EXISTS chat_sessions
  ADD COLUMN IF NOT EXISTS "projectId" UUID;

-- Note: We're not adding foreign key constraint to allow flexible userId
-- This supports both authenticated and anonymous users
