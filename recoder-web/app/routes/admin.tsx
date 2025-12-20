import { useState } from 'react';
import { SystemMonitor } from '~/components/admin/SystemMonitor';
import { OptimizationDashboard } from '~/components/analytics/OptimizationDashboard';

type Tab = 'analytics' | 'system';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('analytics');

  return (
    <div className="min-h-screen bg-bolt-elements-background-depth-1">
      {/* Header */}
      <div className="bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-bolt-elements-textPrimary">Admin Dashboard</h1>
              <p className="text-sm text-bolt-elements-textSecondary">API usage, costs, and system health</p>
            </div>
            <a
              href="/"
              className="px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-lg hover:bg-bolt-elements-button-primary-backgroundHover"
            >
              Back to App
            </a>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-4">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'analytics'
                  ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text'
                  : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="i-ph:chart-line-up" />
                Analytics & Costs
              </div>
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'system'
                  ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text'
                  : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="i-ph:heartbeat" />
                System Health
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {activeTab === 'analytics' && <OptimizationDashboard />}
        {activeTab === 'system' && <SystemMonitor />}
      </div>
    </div>
  );
}
