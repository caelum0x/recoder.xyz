-- User Projects Schema
CREATE TABLE IF NOT EXISTS user_projects (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  project_name TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  preview_url TEXT,
  is_public INTEGER DEFAULT 0,
  likes_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_projects_username ON user_projects(username);
CREATE INDEX IF NOT EXISTS idx_user_projects_public ON user_projects(is_public);
CREATE INDEX IF NOT EXISTS idx_user_projects_created ON user_projects(created_at DESC);

CREATE TABLE IF NOT EXISTS project_likes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES user_projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, username)
);

CREATE INDEX IF NOT EXISTS idx_project_likes_project ON project_likes(project_id);
