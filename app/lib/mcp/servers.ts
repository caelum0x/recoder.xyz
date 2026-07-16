// Re-export from registry for backward compatibility
export { 
  REFERENCE_SERVERS,
  CUSTOM_SERVERS,
  ALL_SERVERS,
  getServerById,
  getServersByCategory,
  validateServerConfig,
  type MCPServerDefinition,
} from './registry';

// Legacy exports (deprecated)
import { getServerById } from './registry';

export const GITHUB_SERVER = getServerById('recoder-github');
export const FILESYSTEM_SERVER = getServerById('filesystem');
export const DEFAULT_SERVERS = [GITHUB_SERVER, FILESYSTEM_SERVER].filter(Boolean);
