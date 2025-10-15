/**
 * Integrations Settings Page
 * Connect third-party services and platforms
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft,
  Terminal,
  Github,
  Chrome,
  MessageSquare,
  GitBranch,
  Code2,
  Webhook,
  CheckCircle,
  Settings,
  ExternalLink,
  Loader2
} from 'lucide-react';

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: any;
  color: string;
  connected: boolean;
  lastSync?: string;
  features: string[];
}

export default function IntegrationsSettingsPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState('');

  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: 'github',
      name: 'GitHub',
      description: 'Connect your GitHub account for seamless code management',
      icon: Github,
      color: 'from-gray-700 to-gray-900',
      connected: true,
      lastSync: '5 minutes ago',
      features: ['Repository access', 'Issue tracking', 'Pull requests']
    },
    {
      id: 'slack',
      name: 'Slack',
      description: 'Get notifications and updates in your Slack workspace',
      icon: MessageSquare,
      color: 'from-purple-600 to-pink-600',
      connected: false,
      features: ['Notifications', 'Command shortcuts', 'Team collaboration']
    },
    {
      id: 'discord',
      name: 'Discord',
      description: 'Integrate with Discord for team communication',
      icon: MessageSquare,
      color: 'from-indigo-600 to-blue-600',
      connected: false,
      features: ['Bot commands', 'Notifications', 'Server integration']
    },
    {
      id: 'gitlab',
      name: 'GitLab',
      description: 'Connect GitLab for source code management',
      icon: GitBranch,
      color: 'from-orange-600 to-red-600',
      connected: false,
      features: ['Repository sync', 'CI/CD integration', 'Issue management']
    },
    {
      id: 'vscode',
      name: 'VS Code',
      description: 'Install the VS Code extension for enhanced productivity',
      icon: Code2,
      color: 'from-blue-600 to-cyan-600',
      connected: true,
      lastSync: 'Just now',
      features: ['Code completion', 'Inline suggestions', 'Context awareness']
    },
    {
      id: 'webhooks',
      name: 'Webhooks',
      description: 'Configure custom webhooks for your workflows',
      icon: Webhook,
      color: 'from-green-600 to-emerald-600',
      connected: false,
      features: ['Custom endpoints', 'Event triggers', 'Real-time updates']
    }
  ]);

  const handleToggleIntegration = async (integrationId: string) => {
    setLoading(integrationId);
    
    try {
      const integration = integrations.find(i => i.id === integrationId);
      
      if (!integration) return;

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      setIntegrations(integrations.map(i => {
        if (i.id === integrationId) {
          return {
            ...i,
            connected: !i.connected,
            lastSync: i.connected ? undefined : 'Just now'
          };
        }
        return i;
      }));

      setSuccess(`${integration.name} ${integration.connected ? 'disconnected' : 'connected'} successfully`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error toggling integration:', error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/settings" className="flex items-center space-x-2 group text-white hover:text-orange-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Settings</span>
          </Link>
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-6 py-24">
        <div className="max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Integrations</h1>
            <p className="text-gray-400">Connect third-party services to enhance your workflow</p>
          </div>

          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-400">{success}</span>
            </div>
          )}

          {/* Integrations Grid */}
          <div className="grid md:grid-cols-2 gap-4">
            {integrations.map((integration) => {
              const Icon = integration.icon;
              const isLoading = loading === integration.id;
              
              return (
                <div
                  key={integration.id}
                  className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl hover:border-white/20 transition-all"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-12 h-12 bg-gradient-to-br ${integration.color} rounded-xl flex items-center justify-center`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold">{integration.name}</h3>
                        {integration.connected && (
                          <div className="flex items-center space-x-1 text-xs text-green-500">
                            <CheckCircle className="w-3 h-3" />
                            <span>Connected</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {integration.connected && (
                      <button className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                        <Settings className="w-4 h-4 text-gray-400" />
                      </button>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-400 mb-4">
                    {integration.description}
                  </p>

                  {/* Features */}
                  <div className="mb-4 space-y-2">
                    {integration.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center space-x-2 text-xs text-gray-500">
                        <div className="w-1 h-1 bg-gray-500 rounded-full" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* Last Sync */}
                  {integration.connected && integration.lastSync && (
                    <div className="mb-4 text-xs text-gray-500">
                      Last synced: {integration.lastSync}
                    </div>
                  )}

                  {/* Action Button */}
                  <button
                    onClick={() => handleToggleIntegration(integration.id)}
                    disabled={isLoading}
                    className={`w-full px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center space-x-2 disabled:opacity-50 ${
                      integration.connected
                        ? 'bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400'
                        : 'bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 text-white'
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : integration.connected ? (
                      <span>Disconnect</span>
                    ) : (
                      <>
                        <span>Connect</span>
                        <ExternalLink className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Custom Integrations */}
          <div className="mt-8 p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
            <h2 className="text-lg font-bold mb-4">Custom Integrations</h2>
            <p className="text-sm text-gray-400 mb-4">
              Need a custom integration? Use our API or webhooks to build your own.
            </p>
            <div className="flex space-x-3">
              <Link
                href="/docs/api"
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center space-x-2"
              >
                <Code2 className="w-4 h-4" />
                <span>API Documentation</span>
              </Link>
              <Link
                href="/settings/api"
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center space-x-2"
              >
                <Webhook className="w-4 h-4" />
                <span>Webhook Settings</span>
              </Link>
            </div>
          </div>

          {/* Help Section */}
          <div className="mt-6 p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <p className="text-sm text-orange-200">
              <strong>Need help?</strong> Check out our{' '}
              <Link href="/docs/integrations" className="underline hover:text-orange-300">
                integration guides
              </Link>{' '}
              or{' '}
              <Link href="/support" className="underline hover:text-orange-300">
                contact support
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
