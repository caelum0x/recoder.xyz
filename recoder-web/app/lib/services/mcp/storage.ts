/**
 * MCP Storage Service
 *
 * Handles persistence of MCP server configurations and tool consents.
 * Uses localStorage for browser-based storage with JSON serialization.
 */

import type {
  McpServer,
  McpToolConsent,
  CreateMcpServerInput,
  UpdateMcpServerInput,
  McpConsentValue,
  McpTransport,
} from './types';

// Storage keys
const STORAGE_KEYS = {
  SERVERS: 'mcp:servers',
  CONSENTS: 'mcp:tool-consents',
} as const;

// =============================================================================
// Utility Functions
// =============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
  const storage = getStorage();
  if (!storage) return defaultValue;

  try {
    const data = storage.getItem(key);
    if (!data) return defaultValue;
    return JSON.parse(data, (key, value) => {
      // Revive Date objects
      if (key === 'createdAt' || key === 'updatedAt' || key === 'lastConnected') {
        return value ? new Date(value) : value;
      }
      return value;
    });
  } catch (error) {
    console.error(`Failed to load ${key} from storage:`, error);
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, data: T): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Failed to save ${key} to storage:`, error);
  }
}

// =============================================================================
// Server Storage
// =============================================================================

/**
 * Load all MCP servers from storage
 */
export function loadServers(): McpServer[] {
  return loadFromStorage<McpServer[]>(STORAGE_KEYS.SERVERS, []);
}

/**
 * Save all MCP servers to storage
 */
export function saveServers(servers: McpServer[]): void {
  saveToStorage(STORAGE_KEYS.SERVERS, servers);
}

/**
 * Get a single server by ID
 */
export function getServer(id: string): McpServer | undefined {
  const servers = loadServers();
  return servers.find((s) => s.id === id);
}

/**
 * Create a new MCP server
 */
export function createServer(input: CreateMcpServerInput): McpServer {
  const servers = loadServers();
  const now = new Date();

  // Parse args if provided as string
  let parsedArgs: string[] | null = null;
  if (input.args) {
    if (typeof input.args === 'string') {
      try {
        parsedArgs = JSON.parse(input.args);
      } catch {
        parsedArgs = input.args.split(' ').filter(Boolean);
      }
    } else {
      parsedArgs = input.args;
    }
  }

  // Parse envJson if provided as string
  let parsedEnvJson: Record<string, string> | null = null;
  if (input.envJson) {
    if (typeof input.envJson === 'string') {
      try {
        parsedEnvJson = JSON.parse(input.envJson);
      } catch {
        parsedEnvJson = null;
      }
    } else {
      parsedEnvJson = input.envJson;
    }
  }

  const newServer: McpServer = {
    id: generateId(),
    name: input.name,
    transport: input.transport || 'stdio',
    command: input.command || null,
    args: parsedArgs,
    envJson: parsedEnvJson,
    url: input.url || null,
    enabled: input.enabled ?? false,
    createdAt: now,
    updatedAt: now,
  };

  servers.push(newServer);
  saveServers(servers);

  return newServer;
}

/**
 * Update an existing MCP server
 */
export function updateServer(input: UpdateMcpServerInput): McpServer {
  const servers = loadServers();
  const index = servers.findIndex((s) => s.id === input.id);

  if (index === -1) {
    throw new Error(`Server not found: ${input.id}`);
  }

  const existing = servers[index];
  const now = new Date();

  // Handle args update
  let updatedArgs = existing.args;
  if (input.args !== undefined) {
    if (input.args) {
      try {
        updatedArgs = JSON.parse(input.args);
      } catch {
        updatedArgs = input.args.split(' ').filter(Boolean);
      }
    } else {
      updatedArgs = null;
    }
  }

  // Handle envJson update
  let updatedEnvJson = existing.envJson;
  if (input.envJson !== undefined) {
    if (input.envJson) {
      if (typeof input.envJson === 'string') {
        try {
          updatedEnvJson = JSON.parse(input.envJson);
        } catch {
          updatedEnvJson = null;
        }
      } else {
        updatedEnvJson = input.envJson;
      }
    } else {
      updatedEnvJson = null;
    }
  }

  const updatedServer: McpServer = {
    ...existing,
    name: input.name ?? existing.name,
    transport: input.transport ?? existing.transport,
    command: input.command ?? existing.command,
    args: updatedArgs,
    envJson: updatedEnvJson,
    url: input.url ?? existing.url,
    enabled: input.enabled ?? existing.enabled,
    updatedAt: now,
  };

  servers[index] = updatedServer;
  saveServers(servers);

  return updatedServer;
}

/**
 * Delete an MCP server
 */
export function deleteServer(id: string): boolean {
  const servers = loadServers();
  const filtered = servers.filter((s) => s.id !== id);

  if (filtered.length === servers.length) {
    return false;
  }

  saveServers(filtered);

  // Also delete all consents for this server
  const consents = loadConsents();
  const filteredConsents = consents.filter((c) => c.serverId !== id);
  saveConsents(filteredConsents);

  return true;
}

/**
 * Toggle server enabled state
 */
export function toggleServerEnabled(id: string, enabled: boolean): McpServer | undefined {
  return updateServer({ id, enabled });
}

// =============================================================================
// Consent Storage
// =============================================================================

/**
 * Load all tool consents from storage
 */
export function loadConsents(): McpToolConsent[] {
  return loadFromStorage<McpToolConsent[]>(STORAGE_KEYS.CONSENTS, []);
}

/**
 * Save all tool consents to storage
 */
export function saveConsents(consents: McpToolConsent[]): void {
  saveToStorage(STORAGE_KEYS.CONSENTS, consents);
}

/**
 * Get consent for a specific server/tool combination
 */
export function getStoredConsent(serverId: string, toolName: string): McpConsentValue {
  const consents = loadConsents();
  const consent = consents.find((c) => c.serverId === serverId && c.toolName === toolName);
  return consent?.consent ?? 'ask';
}

/**
 * Set consent for a specific server/tool combination
 */
export function setStoredConsent(
  serverId: string,
  toolName: string,
  consent: McpConsentValue
): McpToolConsent {
  const consents = loadConsents();
  const now = new Date();
  const existingIndex = consents.findIndex(
    (c) => c.serverId === serverId && c.toolName === toolName
  );

  if (existingIndex >= 0) {
    // Update existing
    consents[existingIndex] = {
      ...consents[existingIndex],
      consent,
      updatedAt: now,
    };
    saveConsents(consents);
    return consents[existingIndex];
  } else {
    // Create new
    const newConsent: McpToolConsent = {
      id: generateId(),
      serverId,
      toolName,
      consent,
      updatedAt: now,
    };
    consents.push(newConsent);
    saveConsents(consents);
    return newConsent;
  }
}

/**
 * Get all consents for a specific server
 */
export function getServerConsents(serverId: string): McpToolConsent[] {
  const consents = loadConsents();
  return consents.filter((c) => c.serverId === serverId);
}

/**
 * Delete all consents for a specific server
 */
export function deleteServerConsents(serverId: string): void {
  const consents = loadConsents();
  const filtered = consents.filter((c) => c.serverId !== serverId);
  saveConsents(filtered);
}

/**
 * Clear all MCP data (servers and consents)
 */
export function clearAllData(): void {
  const storage = getStorage();
  if (!storage) return;

  storage.removeItem(STORAGE_KEYS.SERVERS);
  storage.removeItem(STORAGE_KEYS.CONSENTS);
}

// =============================================================================
// Import/Export
// =============================================================================

export interface McpExportData {
  version: number;
  exportedAt: string;
  servers: McpServer[];
  consents: McpToolConsent[];
}

/**
 * Export all MCP data
 */
export function exportData(): McpExportData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    servers: loadServers(),
    consents: loadConsents(),
  };
}

/**
 * Import MCP data (replaces existing)
 */
export function importData(data: McpExportData): void {
  if (data.version !== 1) {
    throw new Error(`Unsupported export version: ${data.version}`);
  }

  saveServers(data.servers);
  saveConsents(data.consents);
}

/**
 * Import MCP data (merges with existing)
 */
export function mergeImportData(data: McpExportData): void {
  if (data.version !== 1) {
    throw new Error(`Unsupported export version: ${data.version}`);
  }

  const existingServers = loadServers();
  const existingConsents = loadConsents();

  // Merge servers (skip duplicates by name)
  const existingNames = new Set(existingServers.map((s) => s.name));
  const newServers = data.servers.filter((s) => !existingNames.has(s.name));

  // Create ID mapping for merged servers
  const idMapping = new Map<string, string>();
  for (const server of newServers) {
    const oldId = server.id;
    server.id = generateId();
    idMapping.set(oldId, server.id);
  }

  saveServers([...existingServers, ...newServers]);

  // Merge consents (with updated server IDs)
  const newConsents = data.consents
    .filter((c) => idMapping.has(c.serverId))
    .map((c) => ({
      ...c,
      id: generateId(),
      serverId: idMapping.get(c.serverId)!,
    }));

  saveConsents([...existingConsents, ...newConsents]);
}
