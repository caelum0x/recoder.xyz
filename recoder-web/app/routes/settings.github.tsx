/**
 * GitHub Settings Page
 * Shows GitHub connection status and sync options
 */

import { IntegrationStatus } from '~/components/ui/IntegrationStatus';

export default function GitHubSettings() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">GitHub Integration</h2>
        <p className="text-bolt-elements-textSecondary">
          Connect your GitHub account to sync projects and collaborate.
        </p>
      </div>

      {/* Status Indicator */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Connection Status</h3>
        <IntegrationStatus type="github" />
      </div>

      {/* Features Section */}
      <div className="p-4 rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor">
        <h4 className="font-semibold mb-2">GitHub Features</h4>
        <p className="text-sm text-bolt-elements-textSecondary mb-3">
          When connected, you can:
        </p>
        <ul className="text-sm text-bolt-elements-textSecondary space-y-1 ml-4">
          <li>• Push changes to GitHub repositories</li>
          <li>• Pull latest code from branches</li>
          <li>• Commit and sync automatically</li>
          <li>• Clone repositories directly</li>
        </ul>
      </div>

      {/* Connect Button */}
      <div className="pt-4">
        <button className="px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-lg hover:bg-bolt-elements-button-primary-backgroundHover transition-colors">
          Connect GitHub Account
        </button>
      </div>
    </div>
  );
}
