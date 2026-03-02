/**
 * MCP Server Marketplace Component
 * Browse and install MCP servers with one click
 */

import { useState, useEffect, useMemo } from 'react';
// @ts-expect-error - lucide-react exports work at runtime but TypeScript has resolution issues
import { Search, Download, Star, CheckCircle, ExternalLink, Filter, X, Loader2, Shield, Package } from 'lucide-react';
import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MCPMarketplace');

// Types from marketplace catalog
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
    envRequired?: string[];
  };
  tags: string[];
  stars?: number;
  downloads?: number;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

interface MCPMarketplaceProps {
  installedServerIds: string[];
  onInstall: (server: MCPServerConfig) => void;
  onClose?: () => void;
}

const CATEGORY_LABELS: Record<MarketplaceCategory, string> = {
  browser: 'Browser Automation',
  database: 'Databases',
  devtools: 'Developer Tools',
  filesystem: 'File System',
  git: 'Git & VCS',
  search: 'Search',
  cloud: 'Cloud Services',
  productivity: 'Productivity',
  ai: 'AI & ML',
  communication: 'Communication',
  other: 'Other',
};

const CATEGORY_ICONS: Record<MarketplaceCategory, string> = {
  browser: 'i-ph:browser',
  database: 'i-ph:database',
  devtools: 'i-ph:wrench',
  filesystem: 'i-ph:folder-open',
  git: 'i-ph:git-branch',
  search: 'i-ph:magnifying-glass',
  cloud: 'i-ph:cloud',
  productivity: 'i-ph:kanban',
  ai: 'i-ph:brain',
  communication: 'i-ph:chat-circle',
  other: 'i-ph:cube',
};

export default function MCPMarketplace({
  installedServerIds,
  onInstall,
  onClose,
}: MCPMarketplaceProps) {
  const [servers, setServers] = useState<MarketplaceServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<MarketplaceCategory | 'all'>('all');
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [showEnvModal, setShowEnvModal] = useState<MarketplaceServer | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    try {
      const response = await fetch('/api/mcp/marketplace');
      const data = (await response.json()) as { servers?: MarketplaceServer[] };
      setServers(data.servers || []);
    } catch (error) {
      logger.error('Failed to load marketplace:', error);
      toast.error('Failed to load marketplace');
    } finally {
      setLoading(false);
    }
  };

  const filteredServers = useMemo(() => {
    let result = servers;

    // Filter by category
    if (selectedCategory !== 'all') {
      result = result.filter((s) => s.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some((t) => t.includes(q))
      );
    }

    return result;
  }, [servers, selectedCategory, searchQuery]);

  const featuredServers = useMemo(() => {
    return servers.filter((s) => s.featured && !installedServerIds.includes(s.id)).slice(0, 4);
  }, [servers, installedServerIds]);

  const categories = useMemo(() => {
    const counts = new Map<MarketplaceCategory, number>();
    for (const server of servers) {
      counts.set(server.category, (counts.get(server.category) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [servers]);

  const handleInstallClick = (server: MarketplaceServer) => {
    if (server.installCommand.envRequired?.length) {
      // Initialize env values with any defaults
      const initialEnv: Record<string, string> = {};
      for (const key of server.installCommand.envRequired) {
        initialEnv[key] = server.installCommand.env?.[key] || '';
      }
      setEnvValues(initialEnv);
      setShowEnvModal(server);
    } else {
      installServer(server);
    }
  };

  const buildServerConfig = (server: MarketplaceServer, env?: Record<string, string>): MCPServerConfig => {
    const { installCommand } = server;

    // Parse command based on type
    let command: string;
    let args: string[];

    switch (installCommand.type) {
      case 'npx':
        command = 'npx';
        args = installCommand.command.split(' ').filter(Boolean);
        if (installCommand.args) {
          args.push(...installCommand.args);
        }
        break;
      case 'uvx':
        command = 'uvx';
        args = [installCommand.command];
        if (installCommand.args) {
          args.push(...installCommand.args);
        }
        break;
      case 'docker':
        command = 'docker';
        args = ['run', installCommand.command];
        if (installCommand.args) {
          args.push(...installCommand.args);
        }
        break;
      default:
        command = installCommand.command;
        args = installCommand.args || [];
    }

    // Merge env values
    const finalEnv = {
      ...(installCommand.env || {}),
      ...(env || {}),
    };

    // Remove empty env values
    for (const key of Object.keys(finalEnv)) {
      if (!finalEnv[key]) {
        delete finalEnv[key];
      }
    }

    return {
      id: server.id,
      name: server.name,
      command,
      args,
      env: Object.keys(finalEnv).length > 0 ? finalEnv : undefined,
      enabled: true, // Enable by default after install
    };
  };

  const installServer = (server: MarketplaceServer, env?: Record<string, string>) => {
    setInstallingId(server.id);
    try {
      const config = buildServerConfig(server, env);
      onInstall(config);
      toast.success(`${server.name} installed! Click "Connect" to activate.`);
    } catch (error) {
      logger.error('Install error:', error);
      toast.error('Failed to install server');
    } finally {
      setInstallingId(null);
      setShowEnvModal(null);
    }
  };

  const handleEnvSubmit = () => {
    if (!showEnvModal) return;

    // Validate required fields
    const missing = showEnvModal.installCommand.envRequired?.filter(
      (key) => !envValues[key]?.trim()
    );
    if (missing?.length) {
      toast.error(`Please fill in: ${missing.join(', ')}`);
      return;
    }

    installServer(showEnvModal, envValues);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-recoder-elements-background-depth-1">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-recoder-elements-borderColor">
        <div>
          <h2 className="text-xl font-semibold text-recoder-elements-textPrimary flex items-center gap-2">
            <Package className="w-5 h-5" />
            MCP Server Marketplace
          </h2>
          <p className="text-sm text-recoder-elements-textSecondary mt-1">
            Extend your AI assistant with powerful tools and integrations
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-recoder-elements-background-depth-2 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-recoder-elements-textSecondary" />
          </button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="p-4 border-b border-recoder-elements-borderColor">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-recoder-elements-textTertiary" />
            <input
              type="text"
              placeholder="Search servers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value as MarketplaceCategory | 'all')}
            className="px-4 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Categories</option>
            {categories.map(({ category, count }) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]} ({count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Featured Section */}
        {selectedCategory === 'all' && !searchQuery && featuredServers.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-medium text-recoder-elements-textPrimary mb-3 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500" />
              Featured
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {featuredServers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  isInstalled={installedServerIds.includes(server.id)}
                  isInstalling={installingId === server.id}
                  onInstall={() => handleInstallClick(server)}
                  featured
                />
              ))}
            </div>
          </div>
        )}

        {/* Server List */}
        <div>
          {selectedCategory === 'all' && !searchQuery && (
            <h3 className="text-lg font-medium text-recoder-elements-textPrimary mb-3">
              All Servers ({filteredServers.length})
            </h3>
          )}
          {filteredServers.length === 0 ? (
            <div className="text-center py-12 text-recoder-elements-textSecondary">
              No servers found matching your criteria
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredServers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  isInstalled={installedServerIds.includes(server.id)}
                  isInstalling={installingId === server.id}
                  onInstall={() => handleInstallClick(server)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Environment Variables Modal */}
      {showEnvModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-recoder-elements-background-depth-1 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-recoder-elements-textPrimary mb-2">
              Configure {showEnvModal.name}
            </h3>
            <p className="text-sm text-recoder-elements-textSecondary mb-4">
              This server requires the following credentials:
            </p>

            <div className="space-y-3 mb-6">
              {showEnvModal.installCommand.envRequired?.map((key) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-recoder-elements-textPrimary mb-1">
                    {key}
                  </label>
                  <input
                    type={key.toLowerCase().includes('key') || key.toLowerCase().includes('secret') ? 'password' : 'text'}
                    value={envValues[key] || ''}
                    onChange={(e) => setEnvValues({ ...envValues, [key]: e.target.value })}
                    placeholder={`Enter ${key}`}
                    className="w-full px-3 py-2 bg-recoder-elements-background-depth-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowEnvModal(null)}
                className="flex-1 px-4 py-2 border border-recoder-elements-borderColor rounded-lg text-recoder-elements-textSecondary hover:bg-recoder-elements-background-depth-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEnvSubmit}
                disabled={installingId === showEnvModal.id}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {installingId === showEnvModal.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Install
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ServerCardProps {
  server: MarketplaceServer;
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: () => void;
  featured?: boolean;
}

function ServerCard({ server, isInstalled, isInstalling, onInstall, featured }: ServerCardProps) {
  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        featured
          ? 'bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-blue-500/30'
          : 'bg-recoder-elements-background-depth-2 border-recoder-elements-borderColor hover:border-blue-500/50'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            featured ? 'bg-blue-500/20' : 'bg-recoder-elements-background-depth-3'
          }`}>
            <span className={`${server.icon || 'i-ph:cube'} w-5 h-5 text-blue-500`} />
          </div>
          <div>
            <h4 className="font-medium text-recoder-elements-textPrimary flex items-center gap-1">
              {server.name}
              {server.verified && (
                <Shield className="w-3.5 h-3.5 text-green-500" title="Verified" />
              )}
            </h4>
            <span className="text-xs text-recoder-elements-textTertiary">{server.author}</span>
          </div>
        </div>
        <span className="text-xs px-2 py-0.5 bg-recoder-elements-background-depth-3 rounded-full text-recoder-elements-textSecondary">
          {server.toolCount} tools
        </span>
      </div>

      <p className="text-sm text-recoder-elements-textSecondary mb-3 line-clamp-2">
        {server.description}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-recoder-elements-textTertiary">
          {server.stars && (
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3" />
              {server.stars >= 1000 ? `${(server.stars / 1000).toFixed(1)}k` : server.stars}
            </span>
          )}
          {server.downloads && (
            <span className="flex items-center gap-1">
              <Download className="w-3 h-3" />
              {server.downloads >= 1000
                ? `${(server.downloads / 1000).toFixed(0)}k`
                : server.downloads}
            </span>
          )}
        </div>

        {isInstalled ? (
          <span className="flex items-center gap-1 text-xs text-green-500">
            <CheckCircle className="w-3.5 h-3.5" />
            Installed
          </span>
        ) : (
          <button
            onClick={onInstall}
            disabled={isInstalling}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isInstalling ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Installing
              </>
            ) : (
              <>
                <Download className="w-3 h-3" />
                Install
              </>
            )}
          </button>
        )}
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mt-3">
        {server.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-xs px-2 py-0.5 bg-recoder-elements-background-depth-3 text-recoder-elements-textTertiary rounded"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
