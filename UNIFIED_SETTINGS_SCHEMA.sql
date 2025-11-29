-- Unified Settings System for Recoder.xyz
-- Works across app folder and recoder-web
-- Stored in main database (Neon PostgreSQL)

-- User profile settings
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,

  -- Profile information
  display_name VARCHAR(255),
  bio TEXT,
  company VARCHAR(255),
  location VARCHAR(255),
  website VARCHAR(500),
  avatar_url VARCHAR(1000),

  -- Social links
  github_username VARCHAR(255),
  twitter_username VARCHAR(255),
  linkedin_username VARCHAR(255),

  -- Privacy
  public_profile BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Editor & IDE preferences (for recoder-web)
CREATE TABLE IF NOT EXISTS editor_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,

  -- Theme
  theme VARCHAR(20) DEFAULT 'dark', -- 'dark', 'light', 'auto'
  color_scheme VARCHAR(50) DEFAULT 'nord',

  -- Editor preferences
  font_family VARCHAR(100) DEFAULT 'JetBrains Mono',
  font_size INTEGER DEFAULT 14,
  line_height DECIMAL(3,2) DEFAULT 1.5,
  tab_size INTEGER DEFAULT 2,
  use_spaces BOOLEAN DEFAULT true,
  word_wrap BOOLEAN DEFAULT true,
  line_numbers BOOLEAN DEFAULT true,
  minimap BOOLEAN DEFAULT true,
  bracket_matching BOOLEAN DEFAULT true,
  auto_closing_brackets BOOLEAN DEFAULT true,

  -- Code formatting
  format_on_save BOOLEAN DEFAULT true,
  format_on_paste BOOLEAN DEFAULT false,
  trim_trailing_whitespace BOOLEAN DEFAULT true,

  -- Terminal
  terminal_font_size INTEGER DEFAULT 14,
  terminal_cursor_style VARCHAR(20) DEFAULT 'block', -- 'block', 'line', 'underline'
  terminal_shell VARCHAR(50) DEFAULT 'bash',

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- AI preferences (shared across all platforms)
CREATE TABLE IF NOT EXISTS ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,

  -- Default AI model
  default_model VARCHAR(100) DEFAULT 'claude-3.5-sonnet',

  -- Model parameters
  temperature DECIMAL(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 4096,
  top_p DECIMAL(3,2) DEFAULT 0.9,

  -- Behavior
  streaming_enabled BOOLEAN DEFAULT true,
  code_validation BOOLEAN DEFAULT true,
  auto_fix_errors BOOLEAN DEFAULT false,

  -- Context
  include_file_tree BOOLEAN DEFAULT true,
  max_context_files INTEGER DEFAULT 10,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Security settings (2FA, password, sessions)
CREATE TABLE IF NOT EXISTS security_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,

  -- Two-Factor Authentication
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret VARCHAR(255), -- Encrypted TOTP secret
  backup_codes JSONB, -- Array of hashed backup codes

  -- Session management
  session_timeout_minutes INTEGER DEFAULT 30,
  require_2fa_for_api BOOLEAN DEFAULT false,

  -- Security preferences
  password_last_changed TIMESTAMP,
  force_password_change BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Notification preferences
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,

  -- Email notifications
  email_enabled BOOLEAN DEFAULT true,
  email_frequency VARCHAR(20) DEFAULT 'instant', -- 'instant', 'daily', 'weekly', 'never'

  -- Notification types
  notify_project_updates BOOLEAN DEFAULT true,
  notify_usage_alerts BOOLEAN DEFAULT true,
  notify_security_alerts BOOLEAN DEFAULT true,
  notify_new_features BOOLEAN DEFAULT true,
  notify_marketing BOOLEAN DEFAULT false,

  -- In-app notifications
  desktop_notifications BOOLEAN DEFAULT true,
  sound_enabled BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Project preferences
CREATE TABLE IF NOT EXISTS project_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,

  -- Auto-save
  auto_save_enabled BOOLEAN DEFAULT true,
  auto_save_delay_ms INTEGER DEFAULT 1000,

  -- Git
  auto_commit BOOLEAN DEFAULT false,
  commit_message_template VARCHAR(500),

  -- Collaboration
  allow_sharing BOOLEAN DEFAULT true,
  default_share_permissions VARCHAR(20) DEFAULT 'view', -- 'view', 'edit'

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Keyboard shortcuts (stored as JSON for flexibility)
CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,

  -- Shortcuts stored as JSONB
  shortcuts JSONB DEFAULT '{
    "toggleTerminal": {"key": "j", "ctrl": true},
    "saveFile": {"key": "s", "ctrl": true},
    "formatCode": {"key": "f", "shift": true, "alt": true},
    "openCommand": {"key": "p", "ctrl": true},
    "toggleSidebar": {"key": "b", "ctrl": true}
  }',

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Integration settings (webhooks, API keys, etc.)
CREATE TABLE IF NOT EXISTS integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL,

  -- Webhooks
  webhooks JSONB DEFAULT '[]', -- Array of webhook configurations

  -- Third-party integrations
  github_connected BOOLEAN DEFAULT false,
  github_token_encrypted VARCHAR(500),

  slack_connected BOOLEAN DEFAULT false,
  slack_webhook_url_encrypted VARCHAR(500),

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_editor_settings_user_id ON editor_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_settings_user_id ON ai_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_security_settings_user_id ON security_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_settings_user_id ON notification_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_project_settings_user_id ON project_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_keyboard_shortcuts_user_id ON keyboard_shortcuts(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_settings_user_id ON integration_settings(user_id);

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all settings tables
CREATE TRIGGER update_user_profiles_timestamp
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_settings_timestamp();

CREATE TRIGGER update_editor_settings_timestamp
  BEFORE UPDATE ON editor_settings
  FOR EACH ROW EXECUTE FUNCTION update_settings_timestamp();

CREATE TRIGGER update_ai_settings_timestamp
  BEFORE UPDATE ON ai_settings
  FOR EACH ROW EXECUTE FUNCTION update_settings_timestamp();

CREATE TRIGGER update_security_settings_timestamp
  BEFORE UPDATE ON security_settings
  FOR EACH ROW EXECUTE FUNCTION update_settings_timestamp();

CREATE TRIGGER update_notification_settings_timestamp
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW EXECUTE FUNCTION update_settings_timestamp();

CREATE TRIGGER update_project_settings_timestamp
  BEFORE UPDATE ON project_settings
  FOR EACH ROW EXECUTE FUNCTION update_settings_timestamp();

CREATE TRIGGER update_keyboard_shortcuts_timestamp
  BEFORE UPDATE ON keyboard_shortcuts
  FOR EACH ROW EXECUTE FUNCTION update_settings_timestamp();

CREATE TRIGGER update_integration_settings_timestamp
  BEFORE UPDATE ON integration_settings
  FOR EACH ROW EXECUTE FUNCTION update_settings_timestamp();

-- Function to initialize default settings for new users
CREATE OR REPLACE FUNCTION initialize_user_settings(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Create profile
  INSERT INTO user_profiles (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create editor settings
  INSERT INTO editor_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create AI settings
  INSERT INTO ai_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create security settings
  INSERT INTO security_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create notification settings
  INSERT INTO notification_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create project settings
  INSERT INTO project_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create keyboard shortcuts
  INSERT INTO keyboard_shortcuts (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create integration settings
  INSERT INTO integration_settings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- View to get all settings for a user in one query
CREATE OR REPLACE VIEW user_settings_complete AS
SELECT
  u.id as user_id,
  u.email,
  u.name,

  -- Profile
  up.display_name,
  up.bio,
  up.company,
  up.location,
  up.website,
  up.avatar_url,
  up.github_username,
  up.twitter_username,
  up.linkedin_username,
  up.public_profile,

  -- Editor
  es.theme,
  es.color_scheme,
  es.font_family,
  es.font_size,
  es.tab_size,
  es.word_wrap,
  es.line_numbers,
  es.format_on_save,

  -- AI
  ai.default_model,
  ai.temperature,
  ai.max_tokens,
  ai.streaming_enabled,
  ai.code_validation,

  -- Security
  sec.two_factor_enabled,
  sec.session_timeout_minutes,

  -- Notifications
  noti.email_enabled,
  noti.email_frequency,
  noti.notify_project_updates,

  -- Project
  proj.auto_save_enabled,
  proj.auto_save_delay_ms,

  -- Shortcuts
  ks.shortcuts,

  -- Integrations
  integ.github_connected,
  integ.slack_connected

FROM "User" u
LEFT JOIN user_profiles up ON u.id = up.user_id
LEFT JOIN editor_settings es ON u.id = es.user_id
LEFT JOIN ai_settings ai ON u.id = ai.user_id
LEFT JOIN security_settings sec ON u.id = sec.user_id
LEFT JOIN notification_settings noti ON u.id = noti.user_id
LEFT JOIN project_settings proj ON u.id = proj.user_id
LEFT JOIN keyboard_shortcuts ks ON u.id = ks.user_id
LEFT JOIN integration_settings integ ON u.id = integ.user_id;
