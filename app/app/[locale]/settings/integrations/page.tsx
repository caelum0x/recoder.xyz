/**
 * Integrations Settings Page
 * Connect third-party services and platforms
 */

'use client';

import { useState, useEffect } from 'react';
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
import { SiteHeader } from '@/components/SiteHeader';

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
  const [pageLoading, setPageLoading] = useState(true);
  const [loading, setLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState('');

  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: 'github',
      name: 'GitHub',
      description: 'Connect your GitHub account for seamless code management',
      icon: Github,
      color: 'from-gray-700 to-gray-900',
      connected: false,
      lastSync: undefined,
      features: ['Repository access', 'OAuth authentication', 'Profile sync']
    },
    {
      id: 'google',
      name: 'Google',
      description: 'Sign in with your Google account',
      icon: Chrome,
      color: 'from-blue-600 to-red-600',
      connected: false,
      lastSync: undefined,
      features: ['OAuth authentication', 'Profile sync', 'Email integration']
    }
  ]);

  const [comingSoon] = useState([
    { name: 'Slack', icon: MessageSquare, description: 'Team notifications and collaboration' },
    { name: 'Discord', icon: MessageSquare, description: 'Community integration and bots' },
    { name: 'GitLab', icon: GitBranch, description: 'Source code management and CI/CD' },
    { name: 'Webhooks', icon: Webhook, description: 'Custom event triggers and automation' }
  ]);

  // Load integration settings on mount
  useEffect(() => {
    loadIntegrationSettings();
  }, []);

  async function loadIntegrationSettings() {
    try {
      setPageLoading(true);
      const response = await fetch('/api/auth/oauth-status');
      const data = await response.json();

      if (data.success && data.providers) {
        // Update integrations based on actual OAuth connections
        setIntegrations(prev => prev.map(integration => {
          if (integration.id === 'github') {
            return {
              ...integration,
              connected: data.providers.github || false,
              lastSync: data.providers.github ? 'Connected' : undefined
            };
          }
          if (integration.id === 'google') {
            return {
              ...integration,
              connected: data.providers.google || false,
              lastSync: data.providers.google ? 'Connected' : undefined
            };
          }
          return integration;
        }));
      }
    } catch (err) {
      console.error('Failed to load OAuth status:', err);
    } finally {
      setPageLoading(false);
    }
  }

  const handleToggleIntegration = async (integrationId: string) => {
    setLoading(integrationId);

    try {
      const integration = integrations.find(i => i.id === integrationId);

      if (!integration) return;

      if (!integration.connected) {
        // Connecting - initiate OAuth flow using Better Auth
        if (integrationId === 'github') {
          window.location.href = '/api/auth/signin/github';
          return;
        } else if (integrationId === 'google') {
          window.location.href = '/api/auth/signin/google';
          return;
        }
      } else {
        // Disconnecting - this would need to be implemented
        // For now, just show a message
        setSuccess(`To disconnect ${integration.name}, please sign out and sign back in with a different method`);
        setTimeout(() => setSuccess(''), 5000);
      }
    } catch (error) {
      console.error('Error toggling integration:', error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

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

          {/* Coming Soon */}
          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4">Coming Soon</h2>
            <p className="text-sm text-gray-400 mb-6">
              More integrations are on the way. Vote for your favorites on our roadmap.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {comingSoon.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.name}
                    className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl opacity-60"
                  >
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center">
                        <Icon className="w-5 h-5 text-gray-400" />
                      </div>
                      <div>
                        <h3 className="font-bold">{item.name}</h3>
                        <span className="text-xs text-orange-500">Coming Soon</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-500">{item.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Custom Integrations */}
          <div className="mt-8 p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
            <h2 className="text-lg font-bold mb-4">Need Something Custom?</h2>
            <p className="text-sm text-gray-400 mb-4">
              Build your own integrations using our API. Full documentation and examples available.
            </p>
            <div className="flex space-x-3">
              <Link
                href="/docs/api"
                className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center space-x-2"
              >
                <Code2 className="w-4 h-4" />
                <span>API Documentation</span>
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
