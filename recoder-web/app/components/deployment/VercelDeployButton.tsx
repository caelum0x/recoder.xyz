/**
 * Vercel Deployment Button
 * One-click deployment to Vercel from workbench
 */

import { useState } from 'react';
import { toast } from 'react-toastify';
import { workbenchStore } from '~/lib/stores/workbench';

// Icon components using UnoCSS classes
const Upload = ({ className }: { className?: string }) => <div className={`i-ph:upload-simple ${className}`} />;
const Loader2 = ({ className }: { className?: string }) => <div className={`i-ph:spinner ${className}`} />;
const CheckCircle2 = ({ className }: { className?: string }) => <div className={`i-ph:check-circle-fill ${className}`} />;
const ExternalLink = ({ className }: { className?: string }) => <div className={`i-ph:arrow-square-out ${className}`} />;
const XCircle = ({ className }: { className?: string }) => <div className={`i-ph:x-circle-fill ${className}`} />;

interface DeploymentStatus {
  status: 'idle' | 'deploying' | 'success' | 'error';
  message?: string;
  url?: string;
  deploymentId?: string;
}

interface DeployApiResponse {
  error?: string;
  url?: string;
  deploymentId?: string;
}

export function VercelDeployButton() {
  const [deployStatus, setDeployStatus] = useState<DeploymentStatus>({ status: 'idle' });
  const [showDialog, setShowDialog] = useState(false);
  const [projectName, setProjectName] = useState('');

  const handleDeploy = async () => {
    if (!projectName.trim()) {
      toast.error('Please enter a project name');
      return;
    }

    setDeployStatus({ status: 'deploying', message: 'Preparing deployment...' });

    try {
      // Get all files from workbench
      const files = workbenchStore.files.get();
      const fileCount = Object.keys(files).length;

      if (fileCount === 0) {
        throw new Error('No files to deploy');
      }

      // Call deployment API
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'vercel',
          projectName: projectName.trim(),
          files,
        }),
      });

      const data = await response.json() as DeployApiResponse;

      if (!response.ok) {
        throw new Error(data.error || 'Deployment failed');
      }

      setDeployStatus({
        status: 'success',
        message: 'Deployment successful!',
        url: data.url,
        deploymentId: data.deploymentId,
      });

      toast.success('Deployed to Vercel successfully!');
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
  };

  const getStatusIcon = () => {
    switch (deployStatus.status) {
      case 'deploying':
        return <span className="i-ph:spinner w-5 h-5 animate-spin text-blue-500" />;
      case 'success':
        return <span className="i-ph:check-circle w-5 h-5 text-green-500" />;
      case 'error':
        return <span className="i-ph:x-circle w-5 h-5 text-red-500" />;
      default:
        return <span className="i-ph:upload-simple w-5 h-5" />;
    }
  };

  return (
    <>
      {/* Deploy Button */}
      <button
        onClick={() => setShowDialog(true)}
        disabled={deployStatus.status === 'deploying'}
        className="flex items-center gap-2 px-4 py-2 bg-black hover:bg-gray-900 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
        title="Deploy to Vercel"
      >
        {getStatusIcon()}
        <span>Deploy to Vercel</span>
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
          <div className="relative bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg shadow-2xl max-w-md w-full m-4">
            {/* Header */}
            <div className="flex items-center gap-3 p-6 border-b border-bolt-elements-borderColor">
              <div className="p-2 bg-black rounded-lg">
                <Upload className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">
                  Deploy to Vercel
                </h2>
                <p className="text-sm text-bolt-elements-textSecondary">
                  Deploy your project to Vercel's global network
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {deployStatus.status === 'idle' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                      Project Name
                    </label>
                    <input
                      type="text"
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      placeholder="my-awesome-project"
                      className="w-full px-4 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                    <p className="text-xs text-bolt-elements-textSecondary mt-2">
                      Use lowercase letters, numbers, and hyphens only
                    </p>
                  </div>

                  <div className="bg-bolt-elements-background-depth-2 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">
                      What happens next:
                    </h3>
                    <ul className="text-sm text-bolt-elements-textSecondary space-y-1">
                      <li>• Your project files will be uploaded to Vercel</li>
                      <li>• Vercel will build and deploy your application</li>
                      <li>• You'll get a production URL immediately</li>
                      <li>• Automatic HTTPS and global CDN included</li>
                    </ul>
                  </div>
                </>
              )}

              {deployStatus.status === 'deploying' && (
                <div className="text-center py-8">
                  <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
                  <p className="text-bolt-elements-textPrimary font-medium">
                    {deployStatus.message || 'Deploying...'}
                  </p>
                  <p className="text-sm text-bolt-elements-textSecondary mt-2">
                    This may take a minute
                  </p>
                </div>
              )}

              {deployStatus.status === 'success' && (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p className="text-bolt-elements-textPrimary font-medium mb-4">
                    Deployment Successful!
                  </p>
                  {deployStatus.url && (
                    <a
                      href={deployStatus.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                    >
                      <span>Visit Site</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              )}

              {deployStatus.status === 'error' && (
                <div className="text-center py-8">
                  <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <p className="text-bolt-elements-textPrimary font-medium mb-2">
                    Deployment Failed
                  </p>
                  <p className="text-sm text-red-400">{deployStatus.message}</p>
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
                    disabled={!projectName.trim()}
                    className="px-4 py-2 bg-black hover:bg-gray-900 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
