/**
 * MCP Server Marketplace Catalog
 * Curated list of available MCP servers for one-click installation
 */

export type MarketplaceCategory =
  | 'browser'
  | 'database'
  | 'devtools'
  | 'filesystem'
  | 'git'
  | 'search'
  | 'cloud'
  | 'productivity'
  | 'ai'
  | 'communication'
  | 'other';

export interface MarketplaceServer {
  id: string;
  name: string;
  description: string;
  category: MarketplaceCategory;
  author: string;
  homepage?: string;
  repository?: string;
  icon?: string;
  verified: boolean;
  featured: boolean;
  toolCount: number;
  installCommand: {
    type: 'npx' | 'npm' | 'uvx' | 'docker' | 'binary';
    command: string;
    args?: string[];
    env?: Record<string, string>;
    envRequired?: string[];  // Keys that user must provide
  };
  tags: string[];
  stars?: number;
  downloads?: number;
}

/**
 * Curated catalog of popular MCP servers
 * Sources: https://github.com/modelcontextprotocol/servers
 */
export const MARKETPLACE_CATALOG: MarketplaceServer[] = [
  // ===== FEATURED =====
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read, write, and manage files and directories with comprehensive file operations.',
    category: 'filesystem',
    author: 'Anthropic',
    homepage: 'https://modelcontextprotocol.io',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:folder-open',
    verified: true,
    featured: true,
    toolCount: 14,
    installCommand: {
      type: 'npx',
      command: '-y @modelcontextprotocol/server-filesystem',
      args: ['/workspace'],
    },
    tags: ['files', 'read', 'write', 'directory'],
    stars: 5000,
    downloads: 100000,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Interact with GitHub repositories, issues, pull requests, and more.',
    category: 'git',
    author: 'Anthropic',
    homepage: 'https://modelcontextprotocol.io',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:github-logo',
    verified: true,
    featured: true,
    toolCount: 26,
    installCommand: {
      type: 'npx',
      command: '-y @modelcontextprotocol/server-github',
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
      envRequired: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    },
    tags: ['github', 'git', 'repos', 'issues', 'pr'],
    stars: 4500,
    downloads: 85000,
  },
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation with Chrome for web scraping and testing.',
    category: 'browser',
    author: 'Anthropic',
    homepage: 'https://modelcontextprotocol.io',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:browser',
    verified: true,
    featured: true,
    toolCount: 7,
    installCommand: {
      type: 'npx',
      command: '-y @modelcontextprotocol/server-puppeteer',
    },
    tags: ['browser', 'automation', 'scraping', 'testing'],
    stars: 3800,
    downloads: 72000,
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Web and local search using Brave Search API.',
    category: 'search',
    author: 'Anthropic',
    homepage: 'https://modelcontextprotocol.io',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:magnifying-glass',
    verified: true,
    featured: true,
    toolCount: 2,
    installCommand: {
      type: 'npx',
      command: '-y @modelcontextprotocol/server-brave-search',
      env: { BRAVE_API_KEY: '' },
      envRequired: ['BRAVE_API_KEY'],
    },
    tags: ['search', 'web', 'brave'],
    stars: 2800,
    downloads: 45000,
  },

  // ===== BROWSER & AUTOMATION =====
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Cross-browser automation with Playwright for testing and scraping.',
    category: 'browser',
    author: 'executeautomation',
    repository: 'https://github.com/executeautomation/mcp-playwright',
    icon: 'i-ph:desktop',
    verified: true,
    featured: false,
    toolCount: 12,
    installCommand: {
      type: 'npx',
      command: '-y @executeautomation/playwright-mcp-server',
    },
    tags: ['browser', 'playwright', 'testing', 'automation'],
    stars: 1200,
    downloads: 28000,
  },
  {
    id: 'browserbase',
    name: 'Browserbase',
    description: 'Cloud browser automation with Stagehand integration.',
    category: 'browser',
    author: 'browserbase',
    homepage: 'https://browserbase.com',
    repository: 'https://github.com/browserbase/mcp-server-browserbase',
    icon: 'i-ph:cloud',
    verified: true,
    featured: false,
    toolCount: 8,
    installCommand: {
      type: 'npx',
      command: '-y @browserbasehq/mcp-stagehand',
      env: { BROWSERBASE_API_KEY: '', BROWSERBASE_PROJECT_ID: '' },
      envRequired: ['BROWSERBASE_API_KEY', 'BROWSERBASE_PROJECT_ID'],
    },
    tags: ['browser', 'cloud', 'automation'],
    stars: 800,
    downloads: 15000,
  },

  // ===== DATABASE =====
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases with schema inspection.',
    category: 'database',
    author: 'Anthropic',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:database',
    verified: true,
    featured: false,
    toolCount: 5,
    installCommand: {
      type: 'npx',
      command: '-y @modelcontextprotocol/server-postgres',
      env: { POSTGRES_CONNECTION_STRING: '' },
      envRequired: ['POSTGRES_CONNECTION_STRING'],
    },
    tags: ['database', 'postgres', 'sql'],
    stars: 2100,
    downloads: 38000,
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Local SQLite database operations and queries.',
    category: 'database',
    author: 'Anthropic',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:database',
    verified: true,
    featured: false,
    toolCount: 4,
    installCommand: {
      type: 'npx',
      command: '-y @modelcontextprotocol/server-sqlite',
      args: ['--db-path', '/workspace/database.db'],
    },
    tags: ['database', 'sqlite', 'sql', 'local'],
    stars: 1800,
    downloads: 32000,
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Interact with Supabase databases, auth, and storage.',
    category: 'database',
    author: 'supabase',
    homepage: 'https://supabase.com',
    repository: 'https://github.com/supabase-community/supabase-mcp',
    icon: 'i-ph:lightning',
    verified: true,
    featured: false,
    toolCount: 15,
    installCommand: {
      type: 'npx',
      command: '-y supabase-mcp-server',
      env: { SUPABASE_URL: '', SUPABASE_SERVICE_KEY: '' },
      envRequired: ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY'],
    },
    tags: ['database', 'supabase', 'postgres', 'auth', 'storage'],
    stars: 950,
    downloads: 18000,
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Serverless Postgres with branching and scaling.',
    category: 'database',
    author: 'neondatabase',
    homepage: 'https://neon.tech',
    repository: 'https://github.com/neondatabase/mcp-server-neon',
    icon: 'i-ph:lightning',
    verified: true,
    featured: false,
    toolCount: 8,
    installCommand: {
      type: 'npx',
      command: '-y @neondatabase/mcp-server-neon',
      env: { NEON_API_KEY: '' },
      envRequired: ['NEON_API_KEY'],
    },
    tags: ['database', 'neon', 'postgres', 'serverless'],
    stars: 600,
    downloads: 12000,
  },

  // ===== DEVTOOLS =====
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Dynamic problem-solving through thought sequences.',
    category: 'ai',
    author: 'Anthropic',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:brain',
    verified: true,
    featured: false,
    toolCount: 1,
    installCommand: {
      type: 'npx',
      command: '-y @modelcontextprotocol/server-sequential-thinking',
    },
    tags: ['thinking', 'reasoning', 'problem-solving'],
    stars: 1500,
    downloads: 25000,
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent memory using knowledge graph for context retention.',
    category: 'ai',
    author: 'Anthropic',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:memory',
    verified: true,
    featured: false,
    toolCount: 9,
    installCommand: {
      type: 'npx',
      command: '-y @modelcontextprotocol/server-memory',
    },
    tags: ['memory', 'knowledge-graph', 'context'],
    stars: 2200,
    downloads: 42000,
  },
  {
    id: 'sentry',
    name: 'Sentry',
    description: 'Error tracking and issue management with Sentry.',
    category: 'devtools',
    author: 'sentry',
    homepage: 'https://sentry.io',
    repository: 'https://github.com/getsentry/sentry-mcp',
    icon: 'i-ph:bug',
    verified: true,
    featured: false,
    toolCount: 6,
    installCommand: {
      type: 'npx',
      command: '-y @sentry/mcp-server',
      env: { SENTRY_AUTH_TOKEN: '' },
      envRequired: ['SENTRY_AUTH_TOKEN'],
    },
    tags: ['error-tracking', 'debugging', 'sentry'],
    stars: 700,
    downloads: 14000,
  },

  // ===== CLOUD =====
  {
    id: 'aws-kb',
    name: 'AWS Knowledge Base',
    description: 'Interact with AWS Bedrock knowledge bases for RAG.',
    category: 'cloud',
    author: 'AWS',
    homepage: 'https://aws.amazon.com/bedrock',
    repository: 'https://github.com/aws-samples/bedrock-mcp-server',
    icon: 'i-ph:cloud',
    verified: true,
    featured: false,
    toolCount: 4,
    installCommand: {
      type: 'uvx',
      command: 'awslabs.bedrock-kb-retrieval-mcp-server',
      env: { AWS_ACCESS_KEY_ID: '', AWS_SECRET_ACCESS_KEY: '', AWS_REGION: 'us-east-1' },
      envRequired: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    },
    tags: ['aws', 'bedrock', 'rag', 'knowledge-base'],
    stars: 400,
    downloads: 8000,
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Manage Cloudflare Workers, KV, R2, and D1.',
    category: 'cloud',
    author: 'cloudflare',
    homepage: 'https://cloudflare.com',
    repository: 'https://github.com/cloudflare/mcp-server-cloudflare',
    icon: 'i-ph:cloud',
    verified: true,
    featured: false,
    toolCount: 12,
    installCommand: {
      type: 'npx',
      command: '-y @cloudflare/mcp-server-cloudflare',
      env: { CLOUDFLARE_API_TOKEN: '' },
      envRequired: ['CLOUDFLARE_API_TOKEN'],
    },
    tags: ['cloudflare', 'workers', 'edge', 'kv'],
    stars: 550,
    downloads: 11000,
  },

  // ===== COMMUNICATION =====
  {
    id: 'slack',
    name: 'Slack',
    description: 'Read and send Slack messages, manage channels.',
    category: 'communication',
    author: 'Anthropic',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:slack-logo',
    verified: true,
    featured: false,
    toolCount: 6,
    installCommand: {
      type: 'npx',
      command: '-y @modelcontextprotocol/server-slack',
      env: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' },
      envRequired: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
    },
    tags: ['slack', 'messaging', 'team'],
    stars: 1100,
    downloads: 22000,
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Manage Linear issues, projects, and workflows.',
    category: 'productivity',
    author: 'linear',
    homepage: 'https://linear.app',
    repository: 'https://github.com/jerhadf/linear-mcp-server',
    icon: 'i-ph:kanban',
    verified: true,
    featured: false,
    toolCount: 10,
    installCommand: {
      type: 'npx',
      command: '-y linear-mcp-server',
      env: { LINEAR_API_KEY: '' },
      envRequired: ['LINEAR_API_KEY'],
    },
    tags: ['linear', 'issues', 'project-management'],
    stars: 450,
    downloads: 9000,
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Read and write Notion pages, databases, and blocks.',
    category: 'productivity',
    author: 'notion',
    homepage: 'https://notion.so',
    repository: 'https://github.com/makenotion/notion-mcp-server',
    icon: 'i-ph:note',
    verified: true,
    featured: false,
    toolCount: 8,
    installCommand: {
      type: 'npx',
      command: '-y @notionhq/notion-mcp-server',
      env: { NOTION_API_KEY: '' },
      envRequired: ['NOTION_API_KEY'],
    },
    tags: ['notion', 'notes', 'documentation'],
    stars: 900,
    downloads: 17000,
  },

  // ===== SEARCH =====
  {
    id: 'exa',
    name: 'Exa Search',
    description: 'AI-powered semantic web search with Exa.',
    category: 'search',
    author: 'exa',
    homepage: 'https://exa.ai',
    repository: 'https://github.com/exa-labs/exa-mcp-server',
    icon: 'i-ph:magnifying-glass',
    verified: true,
    featured: false,
    toolCount: 3,
    installCommand: {
      type: 'npx',
      command: '-y exa-mcp-server',
      env: { EXA_API_KEY: '' },
      envRequired: ['EXA_API_KEY'],
    },
    tags: ['search', 'web', 'semantic', 'ai'],
    stars: 650,
    downloads: 13000,
  },
  {
    id: 'tavily',
    name: 'Tavily Search',
    description: 'AI-optimized search API for research and RAG.',
    category: 'search',
    author: 'tavily',
    homepage: 'https://tavily.com',
    repository: 'https://github.com/tavily-ai/mcp-server-tavily',
    icon: 'i-ph:magnifying-glass',
    verified: true,
    featured: false,
    toolCount: 2,
    installCommand: {
      type: 'npx',
      command: '-y @tavily/mcp-server',
      env: { TAVILY_API_KEY: '' },
      envRequired: ['TAVILY_API_KEY'],
    },
    tags: ['search', 'web', 'research', 'rag'],
    stars: 520,
    downloads: 10000,
  },

  // ===== GIT =====
  {
    id: 'git',
    name: 'Git',
    description: 'Local git repository operations - status, diff, commit, log.',
    category: 'git',
    author: 'Anthropic',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:git-branch',
    verified: true,
    featured: false,
    toolCount: 8,
    installCommand: {
      type: 'uvx',
      command: 'mcp-server-git',
      args: ['--repository', '/workspace'],
    },
    tags: ['git', 'version-control', 'diff', 'commit'],
    stars: 1600,
    downloads: 30000,
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'GitLab integration for repos, MRs, and CI/CD.',
    category: 'git',
    author: 'gitlab',
    homepage: 'https://gitlab.com',
    repository: 'https://github.com/theNewDynamic/mcp-server-gitlab',
    icon: 'i-ph:gitlab-logo',
    verified: true,
    featured: false,
    toolCount: 18,
    installCommand: {
      type: 'npx',
      command: '-y @thenewdynamic/gitlab-mcp-server',
      env: { GITLAB_PERSONAL_ACCESS_TOKEN: '', GITLAB_API_URL: 'https://gitlab.com/api/v4' },
      envRequired: ['GITLAB_PERSONAL_ACCESS_TOKEN'],
    },
    tags: ['gitlab', 'git', 'ci-cd', 'merge-requests'],
    stars: 380,
    downloads: 7500,
  },

  // ===== PRODUCTIVITY =====
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Search and access files in Google Drive.',
    category: 'productivity',
    author: 'Anthropic',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:google-drive-logo',
    verified: true,
    featured: false,
    toolCount: 4,
    installCommand: {
      type: 'npx',
      command: '-y @modelcontextprotocol/server-gdrive',
      env: { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' },
      envRequired: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    },
    tags: ['google', 'drive', 'files', 'cloud-storage'],
    stars: 750,
    downloads: 15000,
  },
  {
    id: 'google-maps',
    name: 'Google Maps',
    description: 'Location search, directions, and places API.',
    category: 'other',
    author: 'Anthropic',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:map-pin',
    verified: true,
    featured: false,
    toolCount: 5,
    installCommand: {
      type: 'npx',
      command: '-y @modelcontextprotocol/server-google-maps',
      env: { GOOGLE_MAPS_API_KEY: '' },
      envRequired: ['GOOGLE_MAPS_API_KEY'],
    },
    tags: ['google', 'maps', 'location', 'directions'],
    stars: 480,
    downloads: 9500,
  },

  // ===== OTHER =====
  {
    id: 'time',
    name: 'Time',
    description: 'Get current time in any timezone.',
    category: 'other',
    author: 'Anthropic',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:clock',
    verified: true,
    featured: false,
    toolCount: 2,
    installCommand: {
      type: 'npx',
      command: '-y @modelcontextprotocol/server-time',
    },
    tags: ['time', 'timezone', 'utility'],
    stars: 320,
    downloads: 6000,
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'Make HTTP requests and fetch web content.',
    category: 'other',
    author: 'Anthropic',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:globe',
    verified: true,
    featured: false,
    toolCount: 2,
    installCommand: {
      type: 'npx',
      command: '-y @modelcontextprotocol/server-fetch',
    },
    tags: ['http', 'fetch', 'api', 'web'],
    stars: 1400,
    downloads: 28000,
  },
  {
    id: 'everart',
    name: 'EverArt',
    description: 'AI image generation using EverArt.',
    category: 'ai',
    author: 'Anthropic',
    repository: 'https://github.com/modelcontextprotocol/servers',
    icon: 'i-ph:image',
    verified: true,
    featured: false,
    toolCount: 2,
    installCommand: {
      type: 'npx',
      command: '-y @modelcontextprotocol/server-everart',
      env: { EVERART_API_KEY: '' },
      envRequired: ['EVERART_API_KEY'],
    },
    tags: ['image', 'ai', 'generation', 'art'],
    stars: 280,
    downloads: 5500,
  },
];

/**
 * Get all marketplace servers
 */
export function getMarketplaceCatalog(): MarketplaceServer[] {
  return MARKETPLACE_CATALOG;
}

/**
 * Get featured servers
 */
export function getFeaturedServers(): MarketplaceServer[] {
  return MARKETPLACE_CATALOG.filter((s) => s.featured);
}

/**
 * Get servers by category
 */
export function getServersByCategory(category: MarketplaceCategory): MarketplaceServer[] {
  return MARKETPLACE_CATALOG.filter((s) => s.category === category);
}

/**
 * Search servers by name or tags
 */
export function searchServers(query: string): MarketplaceServer[] {
  const q = query.toLowerCase();
  return MARKETPLACE_CATALOG.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tags.some((t) => t.includes(q))
  );
}

/**
 * Get server by ID
 */
export function getServerById(id: string): MarketplaceServer | undefined {
  return MARKETPLACE_CATALOG.find((s) => s.id === id);
}

/**
 * Get all categories with counts
 */
export function getCategoriesWithCounts(): Array<{ category: MarketplaceCategory; count: number }> {
  const counts = new Map<MarketplaceCategory, number>();

  for (const server of MARKETPLACE_CATALOG) {
    counts.set(server.category, (counts.get(server.category) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}
