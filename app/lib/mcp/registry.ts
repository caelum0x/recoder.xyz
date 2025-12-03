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

export function getServerById(id: string): MCPServerDefinition | undefined {
  return ALL_SERVERS.find((s) => s.id === id);
}

export function getServersByCategory(category: MCPServerDefinition['category']): MCPServerDefinition[] {
  return ALL_SERVERS.filter((s) => s.category === category);
}

export function validateServerConfig(config: MCPServerConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const definition = getServerById(config.id);

  if (!definition) {
    errors.push(`Unknown server: ${config.id}`);
    return { valid: false, errors };
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
