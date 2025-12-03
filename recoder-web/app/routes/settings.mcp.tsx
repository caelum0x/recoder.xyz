/**
 * MCP Settings Page
 * Shows MCP server status and configuration
 */

import { IntegrationStatus } from '~/components/ui/IntegrationStatus';

export default function MCPSettings() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">MCP Servers</h2>
        <p className="text-bolt-elements-textSecondary">
          Model Context Protocol servers run in recoder-web and provide AI with access to external tools.
        </p>
      </div>

      {/* Status Indicator */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Server Status</h3>
        <IntegrationStatus type="mcp" />
      </div>

      {/* Info Section */}
      <div className="p-4 rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor">
        <h4 className="font-semibold mb-2">What is MCP?</h4>
        <p className="text-sm text-bolt-elements-textSecondary mb-3">
          MCP is a standardized protocol that lets AI models access external tools. All MCP servers run directly in recoder-web (no external processes needed):
        </p>
        <ul className="text-sm text-bolt-elements-textSecondary space-y-1 ml-4">
          <li>• <strong>GitHub Server</strong> - Clone repos, create PRs, read files, search code</li>
          <li>• <strong>Filesystem Server</strong> - Read/write files, search directories</li>
          <li>• <strong>Database Server</strong> - Query and manage databases</li>
          <li>• <strong>API Server</strong> - Make HTTP requests to external APIs</li>
        </ul>
      </div>

      {/* Built-in Servers */}
      <div className="p-4 rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor">
        <h4 className="font-semibold mb-2">Built-in MCP Servers</h4>
        <p className="text-sm text-bolt-elements-textSecondary mb-3">
          These servers are built into recoder-web and available to AI:
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="font-medium">GitHub</span>
            <span className="text-bolt-elements-textSecondary">- Repository operations, PRs, issues</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="font-medium">Filesystem</span>
            <span className="text-bolt-elements-textSecondary">- File operations in WebContainer</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="font-medium">Database</span>
            <span className="text-bolt-elements-textSecondary">- PostgreSQL, SQLite operations</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="font-medium">API</span>
            <span className="text-bolt-elements-textSecondary">- HTTP requests to external services</span>
          </div>
        </div>
      </div>

      {/* Configuration Link */}
      <div className="pt-4">
        <a
          href="https://modelcontextprotocol.io/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary underline"
        >
          Learn more about MCP →
        </a>
      </div>
    </div>
  );
}
