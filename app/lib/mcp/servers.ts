import type { MCPServerConfig } from './client';

export const GITHUB_SERVER: MCPServerConfig = {
  id: 'github',
  name: 'GitHub',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-github'],
  env: {
    GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN || '',
  },
};

export const FILESYSTEM_SERVER: MCPServerConfig = {
  id: 'filesystem',
  name: 'Filesystem',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
};

export const BRAVE_SEARCH_SERVER: MCPServerConfig = {
  id: 'brave-search',
  name: 'Web Search',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-brave-search'],
  env: {
    BRAVE_API_KEY: process.env.BRAVE_API_KEY || '',
  },
};

export const PLAYWRIGHT_SERVER: MCPServerConfig = {
  id: 'playwright',
  name: 'Browser Automation',
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-playwright'],
};

export const DEFAULT_SERVERS = [
  GITHUB_SERVER,
  FILESYSTEM_SERVER,
  BRAVE_SEARCH_SERVER,
  PLAYWRIGHT_SERVER,
];
