/**
 * Mobile App Constants
 */

export const MOBILE_CONFIG = {
  APP_NAME: 'Recoder Mobile',
  VERSION: '1.0.0',
  API_TIMEOUT: 30000,
  SYNC_INTERVAL: 300000, // 5 minutes
  LOCAL_AI_PORTS: {
    OLLAMA: 11434,
    LM_STUDIO: 1234
  }
};

export const SUPPORTED_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'rust',
  'go',
  'java',
  'cpp',
  'c',
  'html',
  'css',
  'json',
  'yaml',
  'markdown'
];

export const AI_MODELS = {
  OLLAMA_DEFAULT: 'qwen2.5-coder:7b',
  FALLBACK: 'local-model'
};

export const STORAGE_KEYS = {
  USER_SESSION: 'user_session',
  USER_PREFERENCES: 'user_preferences',
  CHAT_HISTORY: 'chat_history',
  PROJECTS: 'projects',
  AGENTS: 'agents',
  LAST_SYNC: 'last_sync',
  PENDING_CHANGES: 'pending_changes'
};