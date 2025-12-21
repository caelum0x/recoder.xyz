-- Community Projects Schema

CREATE TABLE IF NOT EXISTS shared_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  anonymous_id VARCHAR(255),
  
  -- Project info
  project_name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Project data
  files JSONB NOT NULL DEFAULT '{}',
  preview_url TEXT,
  
  -- Visibility
  is_public BOOLEAN DEFAULT TRUE,
  
  -- Stats
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  forks INTEGER DEFAULT 0,
  
  -- Metadata
  tags TEXT[],
  framework VARCHAR(100),
  language VARCHAR(50),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shared_projects_user_id ON shared_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_projects_public ON shared_projects(is_public) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_shared_projects_created_at ON shared_projects(created_at DESC);

-- Project likes
CREATE TABLE IF NOT EXISTS project_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES shared_projects(id) ON DELETE CASCADE,
  user_id UUID,
  anonymous_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, user_id),
  UNIQUE(project_id, anonymous_id)
);

CREATE INDEX IF NOT EXISTS idx_project_likes_project_id ON project_likes(project_id);
