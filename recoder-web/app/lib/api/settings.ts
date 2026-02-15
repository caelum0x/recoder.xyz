/**
 * Settings API Client for Recoder Web
 * Calls app folder settings APIs with cross-domain authentication
 */

import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('SettingsAPI');

const MAIN_SITE_URL = process.env.MAIN_SITE_URL || 'http://localhost:3000';

// Types for settings
export interface ProfileSettings {
  display_name: string;
  bio: string;
  company: string;
  website: string;
  location: string;
  avatar_url: string;
  github_username: string;
  twitter_username: string;
  linkedin_username: string;
  public_profile: boolean;
}

export interface EditorSettings {
  theme: 'dark' | 'light' | 'auto';
  color_scheme: string;
  font_family: string;
  font_size: number;
  line_height: number;
  tab_size: number;
  use_spaces: boolean;
  word_wrap: boolean;
  line_numbers: boolean;
  minimap: boolean;
  bracket_matching: boolean;
  auto_closing_brackets: boolean;
  format_on_save: boolean;
  format_on_paste: boolean;
  trim_trailing_whitespace: boolean;
  terminal_font_size: number;
  terminal_cursor_style: 'block' | 'line' | 'underline';
  terminal_shell: 'bash' | 'zsh' | 'fish';
}

export interface AISettings {
  default_model: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  streaming_enabled: boolean;
  code_validation: boolean;
  auto_fix_errors: boolean;
  include_file_tree: boolean;
  max_context_files: number;
}

export interface SecuritySettings {
  two_factor_enabled: boolean;
  session_timeout: number;
  require_password_change: boolean;
  password_change_days: number;
  allowed_ip_addresses: string[];
  block_unknown_devices: boolean;
}

export interface NotificationSettings {
  email_notifications: boolean;
  desktop_notifications: boolean;
  sound_enabled: boolean;
  notification_frequency: 'instant' | 'hourly' | 'daily';
  email_digest: boolean;
  project_updates: boolean;
  security_alerts: boolean;
  billing_updates: boolean;
}

export interface ProjectSettings {
  auto_save: boolean;
  auto_save_delay: number;
  git_auto_commit: boolean;
  git_commit_message_template: string;
  default_branch: string;
  auto_format_on_commit: boolean;
  run_tests_on_commit: boolean;
}

export interface KeyboardShortcuts {
  shortcuts: Record<string, string>;
}

export interface IntegrationSettings {
  webhooks: any[];
  github_integration: boolean;
  slack_integration: boolean;
  discord_integration: boolean;
  custom_integrations: any[];
}

export interface AllSettings {
  profile: ProfileSettings;
  editor: EditorSettings;
  ai: AISettings;
  security: SecuritySettings;
  notifications: NotificationSettings;
  project: ProjectSettings;
  shortcuts: KeyboardShortcuts;
  integrations: IntegrationSettings;
}

// API Response Types
interface ApiResponse<T = any> {
  success: boolean;
  error?: string;
  profile?: ProfileSettings;
  settings?: T;
  [key: string]: any;
}

// API Client Functions

/**
 * Get user profile settings
 */
export async function getProfileSettings(): Promise<ProfileSettings | null> {
  try {
    const response = await fetch(
      `${MAIN_SITE_URL}/api/settings/profile`,
      {
        credentials: 'include', // Include cookies for cross-domain auth
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json() as ApiResponse;

    if (data.success) {
      return data.profile ?? null;
    }

    logger.error('Failed to fetch profile settings:', data.error);
    return null;
  } catch (error) {
    logger.error('Error fetching profile settings:', error);
    return null;
  }
}

/**
 * Update user profile settings
 */
export async function updateProfileSettings(settings: Partial<ProfileSettings>): Promise<boolean> {
  try {
    const response = await fetch(
      `${MAIN_SITE_URL}/api/settings/profile`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      }
    );

    const data = await response.json() as ApiResponse;
    return data.success ?? false;
  } catch (error) {
    logger.error('Error updating profile settings:', error);
    return false;
  }
}

/**
 * Get editor settings
 */
export async function getEditorSettings(): Promise<EditorSettings | null> {
  try {
    const response = await fetch(
      `${MAIN_SITE_URL}/api/settings/editor`,
      {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json() as ApiResponse<EditorSettings>;

    if (data.success) {
      return data.settings ?? null;
    }

    logger.error('Failed to fetch editor settings:', data.error);
    return null;
  } catch (error) {
    logger.error('Error fetching editor settings:', error);
    return null;
  }
}

/**
 * Update editor settings
 */
export async function updateEditorSettings(settings: Partial<EditorSettings>): Promise<boolean> {
  try {
    const response = await fetch(
      `${MAIN_SITE_URL}/api/settings/editor`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      }
    );

    const data = await response.json() as ApiResponse;
    return data.success ?? false;
  } catch (error) {
    logger.error('Error updating editor settings:', error);
    return false;
  }
}

/**
 * Get AI settings
 */
export async function getAISettings(): Promise<AISettings | null> {
  try {
    const response = await fetch(
      `${MAIN_SITE_URL}/api/settings/ai`,
      {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json() as ApiResponse<AISettings>;

    if (data.success) {
      return data.settings ?? null;
    }

    logger.error('Failed to fetch AI settings:', data.error);
    return null;
  } catch (error) {
    logger.error('Error fetching AI settings:', error);
    return null;
  }
}

/**
 * Update AI settings
 */
export async function updateAISettings(settings: Partial<AISettings>): Promise<boolean> {
  try {
    const response = await fetch(
      `${MAIN_SITE_URL}/api/settings/ai`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settings),
      }
    );

    const data = await response.json() as ApiResponse;
    return data.success ?? false;
  } catch (error) {
    logger.error('Error updating AI settings:', error);
    return false;
  }
}

/**
 * Get all settings in one request (optimized)
 */
export async function getAllSettings(): Promise<AllSettings | null> {
  try {
    const response = await fetch(
      `${MAIN_SITE_URL}/api/settings/all`,
      {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const data = await response.json() as ApiResponse<AllSettings>;

    if (data.success) {
      return data.settings ?? null;
    }

    logger.error('Failed to fetch all settings:', data.error);
    return null;
  } catch (error) {
    logger.error('Error fetching all settings:', error);
    return null;
  }
}

/**
 * Hook for React components to use settings
 * Call this on component mount to load settings
 */
export function useSettings() {
  return {
    getProfile: getProfileSettings,
    updateProfile: updateProfileSettings,
    getEditor: getEditorSettings,
    updateEditor: updateEditorSettings,
    getAI: getAISettings,
    updateAI: updateAISettings,
    getAll: getAllSettings,
  };
}
