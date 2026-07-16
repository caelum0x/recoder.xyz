import type { MCPServerConfig } from './client';

export interface MCPServerDefinition extends MCPServerConfig {
  category: 'reference' | 'official' | 'community' | 'custom';
  description: string;
  requiresAuth?: boolean;
  envVars?: { key: string; description: string; required: boolean }[];
}

// Reference implementations from MCP
export const REFERENCE_SERVERS: MCPServerDefinition[] = [
  {
    id: 'memory',
    name: 'Memory',
    description: 'Knowledge graph-based persistent memory system',
    category: 'reference',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'Web content fetching and conversion for efficient LLM usage',
    category: 'reference',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Secure file operations with configurable access controls',
    category: 'reference',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
  },
  {
    id: 'git',
    name: 'Git',
    description: 'Tools to read, search, and manipulate Git repositories',
    category: 'reference',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Dynamic and reflective problem-solving through thought sequences',
    category: 'reference',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequentialthinking'],
  },
  {
    id: 'time',
    name: 'Time',
    description: 'Time and timezone conversion capabilities',
    category: 'reference',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-time'],
  },
];

// Custom recoder-specific servers
export const CUSTOM_SERVERS: MCPServerDefinition[] = [
  {
    id: 'recoder-github',
    name: 'GitHub Integration',
    description: 'Repository management, file operations, and GitHub API integration',
    category: 'custom',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    requiresAuth: true,
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN || '',
    },
    envVars: [
      {
        key: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        description: 'GitHub Personal Access Token with repo permissions',
        required: true,
      },
    ],
  },
  {
    id: 'recoder-workspace',
    name: 'Recoder Workspace',
    description: 'Access to recoder project workspace files',
    category: 'custom',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace/recoder'],
  },
];

export const ALL_SERVERS = [...REFERENCE_SERVERS, ...CUSTOM_SERVERS];

const RESERVED_ENV_KEY_PATTERN = /^(?:npm_config_|NPM_CONFIG_|PNPM_|YARN_|BUN_|NODE_OPTIONS|PATH|HOME|SHELL|LD_|DYLD_)/;

export function getServerById(id: string): MCPServerDefinition | undefined {
  return ALL_SERVERS.find((s) => s.id === id);
}

export function getServersByCategory(category: MCPServerDefinition['category']): MCPServerDefinition[] {
  return ALL_SERVERS.filter((s) => s.category === category);
}

function getAllowedEnvKeys(definition: MCPServerDefinition): Set<string> {
  return new Set((definition.envVars || []).map((envVar) => envVar.key));
}

export function sanitizeServerEnv(
  definition: MCPServerDefinition,
  env?: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!env) {
    return definition.env ? { ...definition.env } : undefined;
  }

  const allowedEnvKeys = getAllowedEnvKeys(definition);
  const mergedEnv: Record<string, string> = { ...(definition.env || {}) };
  const invalidKeys: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }

    if (RESERVED_ENV_KEY_PATTERN.test(key) || !allowedEnvKeys.has(key)) {
      invalidKeys.push(key);
      continue;
    }

    mergedEnv[key] = value;
  }

  if (invalidKeys.length > 0) {
    throw new Error(`Unsupported MCP environment key(s): ${invalidKeys.join(', ')}`);
  }

  return Object.keys(mergedEnv).length > 0 ? mergedEnv : undefined;
}

export function buildServerConfig(
  serverId: string,
  config?: Partial<MCPServerConfig> | null,
): MCPServerConfig {
  const definition = getServerById(serverId);
  if (!definition) {
    throw new Error(`Server ${serverId} not found in registry`);
  }

  return {
    id: definition.id,
    name: definition.name,
    command: definition.command,
    args: [...definition.args],
    env: sanitizeServerEnv(definition, config?.env),
  };
}

export function validateServerConfig(config: MCPServerConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const definition = getServerById(config.id);

  if (!definition) {
    errors.push(`Unknown server: ${config.id}`);
    return { valid: false, errors };
  }

  if (config.command !== definition.command) {
    errors.push(`Command mismatch for server: ${config.id}`);
  }

  if (JSON.stringify(config.args) !== JSON.stringify(definition.args)) {
    errors.push(`Args mismatch for server: ${config.id}`);
  }

  try {
    sanitizeServerEnv(definition, config.env);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (definition.requiresAuth && definition.envVars) {
    for (const envVar of definition.envVars) {
      if (envVar.required && !config.env?.[envVar.key]) {
        errors.push(`Missing required environment variable: ${envVar.key}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
