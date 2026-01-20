/**
 * Netlify Deployment Button
 * One-click deployment to Netlify from workbench
 */

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';

interface DeploymentStatus {
  status: 'idle' | 'deploying' | 'success' | 'error';
  message?: string;
  url?: string;
  deploymentId?: string;
  logs?: string;
}

interface DeployApiResponse {
  success: boolean;
  error?: string;
  data?: {
    url?: string;
    deploymentId?: string;
    id?: string;
    status?: string;
  };
}

interface StatusApiResponse {
  success: boolean;
  error?: string;
  data?: {
    status: string;
    url?: string;
    logs?: string;
  };
}

export function NetlifyDeployButton() {
  const [deployStatus, setDeployStatus] = useState<DeploymentStatus>({ status: 'idle' });
  const [showDialog, setShowDialog] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [envVars, setEnvVars] = useState('');
  const [showLogs, setShowLogs] = useState(false);

  // Load saved token from localStorage
  useEffect(() => {
    if (showDialog && typeof window !== 'undefined') {
      const savedTokens = localStorage.getItem('deployment_tokens');
      if (savedTokens) {
        try {
          const tokens = JSON.parse(savedTokens);
          if (tokens.netlify) {
            setApiToken(tokens.netlify);
          }
        } catch (e) {
          console.error('Failed to load saved token:', e);
        }
      }
    }
  }, [showDialog]);

  // Poll for deployment status
  const pollDeploymentStatus = useCallback(async (deploymentId: string, token: string) => {
    const maxAttempts = 60;
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setDeployStatus(prev => ({
          ...prev,
          status: 'error',
          message: 'Deployment timed out. Check Netlify dashboard for status.',
        }));
        return;
      }

      try {
        const response = await fetch(
          `/api/deploy/status?provider=netlify&deploymentId=${deploymentId}&logs=true`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        const data = await response.json() as StatusApiResponse;

        if (data.success && data.data) {
          const { status, url, logs } = data.data;

          setDeployStatus(prev => ({
            ...prev,
            message: `Status: ${status}`,
            logs: logs || prev.logs,
          }));

          if (status === 'deployed') {
            setDeployStatus({
              status: 'success',
              message: 'Deployment successful!',
              url: url,
              deploymentId,
              logs,
            });
            toast.success('Deployed to Netlify successfully!');
            return;
          }

          if (status === 'failed') {
            setDeployStatus({
              status: 'error',
              message: 'Deployment failed',
              deploymentId,
              logs,
            });
            toast.error('Netlify deployment failed');
            return;
          }
        }

        // Continue polling
        attempts++;
        setTimeout(poll, 3000);
      } catch (error) {
        console.error('Status poll error:', error);
        attempts++;
        setTimeout(poll, 5000);
      }
    };

    poll();
  }, []);

  const handleDeploy = async () => {
    if (!projectName.trim()) {
      toast.error('Please enter a project name');
      return;
    }

    if (!apiToken.trim()) {
      toast.error('Please enter your Netlify API token');
      return;
    }

    setDeployStatus({ status: 'deploying', message: 'Preparing deployment...' });

    try {
      // Save token to localStorage
      if (typeof window !== 'undefined') {
        const savedTokens = JSON.parse(localStorage.getItem('deployment_tokens') || '{}');
        savedTokens.netlify = apiToken;
        localStorage.setItem('deployment_tokens', JSON.stringify(savedTokens));
      }

      // Get all files from workbench
      const files = workbenchStore.files.get();
      const fileCount = Object.keys(files).length;

      if (fileCount === 0) {
        throw new Error('No files to deploy');
      }

      setDeployStatus({ status: 'deploying', message: `Uploading ${fileCount} files...` });

      // Parse environment variables
      let environmentVariables: Record<string, string> = {};
      if (envVars.trim()) {
        envVars.split('\n').forEach(line => {
          const [key, ...valueParts] = line.split('=');
          if (key?.trim()) {
            environmentVariables[key.trim()] = valueParts.join('=').trim();
          }
        });
      }

      // Call deployment API
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deploy',
          config: {
            platform: 'netlify',
            projectName: projectName.trim(),
            environmentVariables,
            token: apiToken,
          },
          files,
        }),
      });

      const data = await response.json() as DeployApiResponse;

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Deployment failed');
      }

      const deploymentId = data.data?.deploymentId || data.data?.id;
      const deploymentUrl = data.data?.url;

      if (deploymentUrl) {
        // Deployment already complete
        setDeployStatus({
          status: 'success',
          message: 'Deployment successful!',
          url: deploymentUrl,
          deploymentId,
        });
        toast.success('Deployed to Netlify successfully!');
      } else if (deploymentId) {
        // Poll for status
        setDeployStatus({
          status: 'deploying',
          message: 'Building and deploying...',
          deploymentId,
        });
        pollDeploymentStatus(deploymentId, apiToken);
      } else {
        throw new Error('No deployment ID returned');
      }
    } catch (error: any) {
      console.error('Deployment failed:', error);
      setDeployStatus({
        status: 'error',
        message: error.message || 'Deployment failed',
      });
      toast.error(error.message || 'Deployment failed');
    }
  };

  const resetDeploy = () => {
    setDeployStatus({ status: 'idle' });
    setShowDialog(false);
    setProjectName('');
    setEnvVars('');
    setShowLogs(false);
  };

  const getStatusIcon = () => {
    switch (deployStatus.status) {
      case 'deploying':
        return <span className="i-ph:spinner w-5 h-5 animate-spin text-teal-500" />;
      case 'success':
        return <span className="i-ph:check-circle w-5 h-5 text-green-500" />;
      case 'error':
        return <span className="i-ph:x-circle w-5 h-5 text-red-500" />;
      default:
        return <span className="i-simple-icons:netlify w-5 h-5" />;
    }
  };

  return (
    <>
      {/* Deploy Button */}
      <button
        onClick={() => setShowDialog(true)}
        disabled={deployStatus.status === 'deploying'}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        title="Deploy to Netlify"
      >
        {getStatusIcon()}
        <span>Deploy to Netlify</span>
      </button>

      {/* Deployment Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => deployStatus.status === 'idle' && setShowDialog(false)}
          />

          {/* Dialog */}
          <div className="relative bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg shadow-2xl max-w-md w-full m-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center gap-3 p-6 border-b border-bolt-elements-borderColor">
              <div className="p-2 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg">
                <span className="i-simple-icons:netlify w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">
                  Deploy to Netlify
                </h2>
                <p className="text-sm text-bolt-elements-textSecondary">
                  Deploy your project to Netlify's global CDN
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {deployStatus.status === 'idle' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                      Project Name *
                    </label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="my-awesome-project"
                      className="w-full px-4 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-teal-500"
                      autoFocus
                    />
                    <p className="text-xs text-bolt-elements-textSecondary mt-2">
                      Use lowercase letters, numbers, and hyphens only
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                      Netlify API Token *
                    </label>
                    <input
                      type="password"
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      placeholder="Enter your Netlify token"
                      className="w-full px-4 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm"
                    />
                    <a
                      href="https://app.netlify.com/user/applications#personal-access-tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-teal-400 hover:text-teal-300 mt-1 inline-block"
                    >
                      Get your Netlify token here
                    </a>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                      Environment Variables (optional)
                    </label>
                    <textarea
                      value={envVars}
                      onChange={(e) => setEnvVars(e.target.value)}
                      placeholder="API_KEY=your-key&#10;NODE_ENV=production"
                      rows={3}
                      className="w-full px-4 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-sm"
                    />
                    <p className="text-xs text-bolt-elements-textSecondary mt-1">
                      One variable per line in KEY=value format
                    </p>
                  </div>

                  <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">
                      What happens next:
                    </h3>
                    <ul className="text-sm text-bolt-elements-textSecondary space-y-1">
                      <li>Your project files will be uploaded to Netlify</li>
                      <li>Automatic HTTPS and global CDN included</li>
                      <li>SPA routing configured automatically</li>
                      <li>You'll get a production URL immediately</li>
                    </ul>
                  </div>
                </>
              )}

              {deployStatus.status === 'deploying' && (
                <div className="text-center py-8">
                  <span className="i-ph:spinner w-12 h-12 animate-spin text-teal-500 mx-auto mb-4" />
                  <p className="text-bolt-elements-textPrimary font-medium">
                    {deployStatus.message || 'Deploying...'}
                  </p>
                  <p className="text-sm text-bolt-elements-textSecondary mt-2">
                    This may take a minute
                  </p>
                  {deployStatus.logs && (
                    <div className="mt-4 text-left">
                      <button
                        onClick={() => setShowLogs(!showLogs)}
                        className="text-sm text-teal-400 hover:text-teal-300"
                      >
                        {showLogs ? 'Hide Logs' : 'Show Logs'}
                      </button>
                      {showLogs && (
                        <pre className="mt-2 p-3 bg-bolt-elements-background-depth-3 rounded-lg text-xs text-bolt-elements-textSecondary overflow-auto max-h-40">
                          {deployStatus.logs}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}

              {deployStatus.status === 'success' && (
                <div className="text-center py-8">
                  <span className="i-ph:check-circle-fill w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p className="text-bolt-elements-textPrimary font-medium mb-4">
                    Deployment Successful!
                  </p>
                  {deployStatus.url && (
                    <a
                      href={deployStatus.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg font-medium transition-colors"
                    >
                      <span>Visit Site</span>
                      <span className="i-ph:arrow-square-out w-4 h-4" />
                    </a>
                  )}
                </div>
              )}

              {deployStatus.status === 'error' && (
                <div className="text-center py-8">
                  <span className="i-ph:x-circle-fill w-12 h-12 text-red-500 mx-auto mb-4" />
                  <p className="text-bolt-elements-textPrimary font-medium mb-2">
                    Deployment Failed
                  </p>
                  <p className="text-sm text-red-400">{deployStatus.message}</p>
                  {deployStatus.logs && (
                    <div className="mt-4 text-left">
                      <button
                        onClick={() => setShowLogs(!showLogs)}
                        className="text-sm text-teal-400 hover:text-teal-300"
                      >
                        {showLogs ? 'Hide Logs' : 'Show Logs'}
                      </button>
                      {showLogs && (
                        <pre className="mt-2 p-3 bg-bolt-elements-background-depth-3 rounded-lg text-xs text-bolt-elements-textSecondary overflow-auto max-h-40">
                          {deployStatus.logs}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-bolt-elements-borderColor">
              {deployStatus.status === 'idle' && (
                <>
                  <button
                    onClick={() => setShowDialog(false)}
                    className="px-4 py-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeploy}
                    disabled={!projectName.trim() || !apiToken.trim()}
                    className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Deploy Now
                  </button>
                </>
              )}

              {deployStatus.status === 'deploying' && (
                <button
                  disabled
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg font-medium cursor-not-allowed opacity-50"
                >
                  Deploying...
                </button>
              )}

              {(deployStatus.status === 'success' || deployStatus.status === 'error') && (
                <button
                  onClick={resetDeploy}
                  className="px-4 py-2 bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary rounded-lg font-medium transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
