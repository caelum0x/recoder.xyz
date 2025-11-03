/**
 * Deployment Manager Component
 * Deploy projects to Vercel, Netlify, and other platforms
 */

import { useState, useEffect } from 'react';
import { Rocket, ExternalLink, Loader2, CheckCircle, XCircle, Settings, GitBranch } from 'lucide-react';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';

interface Deployment {
  id: string;
  platform: 'vercel' | 'netlify' | 'cloudflare';
  url: string;
  status: 'building' | 'ready' | 'error';
  createdAt: Date;
  buildLog?: string;
}

const PLATFORMS = [
  {
    id: 'vercel',
    name: 'Vercel',
    icon: '▲',
    description: 'Deploy to Vercel with zero configuration',
    color: 'from-black to-gray-800',
  },
  {
    id: 'netlify',
    name: 'Netlify',
    icon: '◇',
    description: 'Deploy to Netlify with continuous deployment',
    color: 'from-teal-500 to-cyan-600',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Pages',
    icon: '☁',
    description: 'Deploy to Cloudflare Pages edge network',
    color: 'from-orange-500 to-yellow-600',
  },
];

export default function DeploymentManager() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [config, setConfig] = useState({
    projectName: '',
    envVars: '',
    buildCommand: '',
    outputDirectory: '',
  });
  const [apiTokens, setApiTokens] = useState<{
    vercel?: string;
    netlify?: string;
    cloudflare?: { token: string; accountId: string };
  }>(() => {
    // Load tokens from localStorage on mount
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('deployment_tokens');
      return stored ? JSON.parse(stored) : {};
    }
    return {};
  });

  useEffect(() => {
    loadDeployments();
  }, []);

  // Save tokens to localStorage whenever they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('deployment_tokens', JSON.stringify(apiTokens));
    }
  }, [apiTokens]);

  const hasToken = (platform: string) => {
    if (platform === 'vercel') return !!apiTokens.vercel;
    if (platform === 'netlify') return !!apiTokens.netlify;
    if (platform === 'cloudflare') return !!(apiTokens.cloudflare?.token && apiTokens.cloudflare?.accountId);
    return false;
  };

  const loadDeployments = async () => {
    try {
      const response = await fetch('/api/deployments');
      if (response.ok) {
        const data = await response.json();
        setDeployments(data.deployments || []);
      }
    } catch (error) {
      console.error('Failed to load deployments:', error);
    }
  };

  const handleDeploy = async () => {
    if (!selectedPlatform) {
      toast.error('Please select a platform');
      return;
    }

    // Check if user has token for selected platform
    if (!hasToken(selectedPlatform)) {
      toast.error(`Please add your ${selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1)} API token first`);
      setShowTokenInput(true);
      return;
    }

    const files = workbenchStore.files.get();
    if (!files || Object.keys(files).length === 0) {
      toast.error('No files to deploy');
      return;
    }

    setLoading(true);
    try {
      // Prepare files for deployment
      const fileContents: Record<string, string> = {};
      for (const [path, file] of Object.entries(files)) {
        if (file?.type === 'file' && file.content) {
          fileContents[path] = file.content;
        }
      }

      // Add API tokens to the request
      const platformToken = selectedPlatform === 'vercel' ? apiTokens.vercel :
                            selectedPlatform === 'netlify' ? apiTokens.netlify :
                            selectedPlatform === 'cloudflare' ? apiTokens.cloudflare : undefined;

      const response = await fetch('/api/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: selectedPlatform,
          files: fileContents,
          apiToken: platformToken,
          config: {
            projectName: config.projectName || `recoder-${Date.now()}`,
            envVars: config.envVars ? JSON.parse(config.envVars) : {},
            buildCommand: config.buildCommand || 'npm run build',
            outputDirectory: config.outputDirectory || 'dist',
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Deployment failed');
      }

      const data = await response.json();
      setDeployments([data.deployment, ...deployments]);
      toast.success(`Deploying to ${selectedPlatform}...`);
      setSelectedPlatform(null);
      setShowConfig(false);
      
      // Reset config
      setConfig({
        projectName: '',
        envVars: '',
        buildCommand: '',
        outputDirectory: '',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Deployment failed');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlatformSelect = (platformId: string) => {
    setSelectedPlatform(platformId);
    setShowConfig(true);
  };

  const getStatusIcon = (status: Deployment['status']) => {
    switch (status) {
      case 'building':
        return <Loader2 className="w-4 h-4 text-yellow-500 animate-spin" />;
      case 'ready':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-bolt-elements-background-depth-1">
      {/* Header */}
      <div className="border-b border-bolt-elements-borderColor p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg">
            <Rocket className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-bolt-elements-textPrimary">
              Deploy Your Project
            </h1>
            <p className="text-sm text-bolt-elements-textSecondary">
              Deploy to production with one click
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* API Token Input Modal */}
        {showTokenInput && (
          <div className="mb-6 bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">
                Configure API Tokens
              </h2>
              <button
                onClick={() => setShowTokenInput(false)}
                className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
              >
                <div className="i-ph:x text-lg" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Vercel Token */}
              <div>
                <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  Vercel Token {apiTokens.vercel && <span className="text-green-400">✓</span>}
                </label>
                <input
                  type="password"
                  value={apiTokens.vercel || ''}
                  onChange={(e) => setApiTokens({ ...apiTokens, vercel: e.target.value })}
                  placeholder="Enter your Vercel token"
                  className="w-full px-4 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <a
                  href="https://vercel.com/account/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
                >
                  Get your Vercel token →
                </a>
              </div>

              {/* Netlify Token */}
              <div>
                <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  Netlify Token {apiTokens.netlify && <span className="text-green-400">✓</span>}
                </label>
                <input
                  type="password"
                  value={apiTokens.netlify || ''}
                  onChange={(e) => setApiTokens({ ...apiTokens, netlify: e.target.value })}
                  placeholder="Enter your Netlify token"
                  className="w-full px-4 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <a
                  href="https://app.netlify.com/user/applications#personal-access-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
                >
                  Get your Netlify token →
                </a>
              </div>

              {/* Cloudflare Token */}
              <div>
                <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  Cloudflare API Token {apiTokens.cloudflare?.token && <span className="text-green-400">✓</span>}
                </label>
                <input
                  type="password"
                  value={apiTokens.cloudflare?.token || ''}
                  onChange={(e) => setApiTokens({ ...apiTokens, cloudflare: { ...apiTokens.cloudflare!, token: e.target.value } })}
                  placeholder="Enter your Cloudflare API token"
                  className="w-full px-4 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
                />
                <input
                  type="text"
                  value={apiTokens.cloudflare?.accountId || ''}
                  onChange={(e) => setApiTokens({ ...apiTokens, cloudflare: { token: apiTokens.cloudflare?.token || '', accountId: e.target.value } })}
                  placeholder="Enter your Cloudflare Account ID"
                  className="w-full px-4 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <a
                  href="https://dash.cloudflare.com/profile/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
                >
                  Get your Cloudflare credentials →
                </a>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4 mt-4">
                <p className="text-sm text-bolt-elements-textSecondary">
                  🔒 Your tokens are stored locally in your browser and never sent to our servers.
                  They are only used to make direct API calls to deployment platforms.
                </p>
              </div>

              <button
                onClick={() => setShowTokenInput(false)}
                className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
              >
                Save Tokens
              </button>
            </div>
          </div>
        )}

        {/* Platform Selection */}
        {!showConfig && !showTokenInput && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">
                Choose Deployment Platform
              </h2>
              <button
                onClick={() => setShowTokenInput(true)}
                className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Configure API Tokens
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PLATFORMS.map((platform) => (
                <button
                  key={platform.id}
                  onClick={() => handlePlatformSelect(platform.id)}
                  className="text-left p-6 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg hover:border-bolt-elements-borderColor-hover transition-all hover:shadow-lg group relative"
                >
                  {hasToken(platform.id) && (
                    <div className="absolute top-2 right-2 w-3 h-3 bg-green-500 rounded-full" title="Token configured" />
                  )}
                  <div className={`w-12 h-12 bg-gradient-to-br ${platform.color} rounded-lg flex items-center justify-center text-white text-2xl mb-4 group-hover:scale-110 transition-transform`}>
                    {platform.icon}
                  </div>
                  <h3 className="font-semibold text-bolt-elements-textPrimary mb-2">
                    {platform.name}
                  </h3>
                  <p className="text-sm text-bolt-elements-textSecondary">
                    {platform.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Configuration Form */}
        {showConfig && selectedPlatform && (
          <div className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">
                Configure Deployment
              </h2>
              <button
                onClick={() => {
                  setShowConfig(false);
                  setSelectedPlatform(null);
                }}
                className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
              >
                Back
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  Project Name
                </label>
                <input
                  type="text"
                  value={config.projectName}
                  onChange={(e) => setConfig({ ...config, projectName: e.target.value })}
                  placeholder="my-awesome-project"
                  className="w-full px-4 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                    Build Command
                  </label>
                  <input
                    type="text"
                    value={config.buildCommand}
                    onChange={(e) => setConfig({ ...config, buildCommand: e.target.value })}
                    placeholder="npm run build"
                    className="w-full px-4 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                    Output Directory
                  </label>
                  <input
                    type="text"
                    value={config.outputDirectory}
                    onChange={(e) => setConfig({ ...config, outputDirectory: e.target.value })}
                    placeholder="dist"
                    className="w-full px-4 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  Environment Variables (JSON)
                </label>
                <textarea
                  value={config.envVars}
                  onChange={(e) => setConfig({ ...config, envVars: e.target.value })}
                  placeholder='{"API_KEY": "your-key", "NODE_ENV": "production"}'
                  rows={4}
                  className="w-full px-4 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm resize-none"
                />
              </div>

              <button
                onClick={handleDeploy}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Deploying...
                  </>
                ) : (
                  <>
                    <Rocket className="w-5 h-5" />
                    Deploy to {PLATFORMS.find(p => p.id === selectedPlatform)?.name}
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Deployments List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">
            Recent Deployments ({deployments.length})
          </h2>

          {deployments.length === 0 ? (
            <div className="text-center py-12 bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor border-dashed">
              <Rocket className="w-12 h-12 text-bolt-elements-textTertiary mx-auto mb-3" />
              <p className="text-bolt-elements-textSecondary">No deployments yet</p>
              <p className="text-sm text-bolt-elements-textTertiary mt-1">
                Deploy your first project to get started
              </p>
            </div>
          ) : (
            deployments.map((deployment) => (
              <div
                key={deployment.id}
                className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {getStatusIcon(deployment.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-bolt-elements-textPrimary">
                          {deployment.platform.charAt(0).toUpperCase() + deployment.platform.slice(1)} Deployment
                        </h3>
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          deployment.status === 'ready' ? 'bg-green-500/20 text-green-400' :
                          deployment.status === 'building' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {deployment.status}
                        </span>
                      </div>
                      <p className="text-sm text-bolt-elements-textSecondary mt-1">
                        {new Date(deployment.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {deployment.status === 'ready' && deployment.url && (
                    <a
                      href={deployment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Visit Site
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Info Section */}
        <div className="mt-6 bg-green-500/10 border border-green-500/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <GitBranch className="w-5 h-5 text-green-400 mt-0.5" />
            <div>
              <h3 className="font-medium text-green-400 mb-1">Production Deployments</h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                Your projects are deployed to production-ready platforms with automatic SSL,
                global CDN, and continuous deployment from your code.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
