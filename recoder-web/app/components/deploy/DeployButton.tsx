import { useState } from 'react';
import { Rocket, ExternalLink, Loader2, CheckCircle, XCircle, Globe, X } from 'lucide-react';

interface DeployButtonProps {
  files: Record<string, string>;
  projectName: string;
  disabled?: boolean;
}

type DeployStatus = 'idle' | 'preparing' | 'uploading' | 'building' | 'deploying' | 'success' | 'error';

interface DeployState {
  status: DeployStatus;
  message: string;
  url?: string;
  error?: string;
}

const STATUS_MESSAGES: Record<DeployStatus, string> = {
  idle: '',
  preparing: 'Preparing files...',
  uploading: 'Uploading to server...',
  building: 'Building project...',
  deploying: 'Deploying...',
  success: 'Deployed successfully!',
  error: 'Deployment failed',
};

export function DeployButton({ files, projectName, disabled }: DeployButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [deployState, setDeployState] = useState<DeployState>({ status: 'idle', message: '' });
  const [selectedPlatform, setSelectedPlatform] = useState<'vercel' | 'netlify' | null>(null);

  const isDeploying = ['preparing', 'uploading', 'building', 'deploying'].includes(deployState.status);

  async function handleDeploy(platform: 'vercel' | 'netlify') {
    setSelectedPlatform(platform);
    setDeployState({ status: 'preparing', message: STATUS_MESSAGES.preparing });

    try {
      // Simulate preparation
      await new Promise(r => setTimeout(r, 500));
      setDeployState({ status: 'uploading', message: STATUS_MESSAGES.uploading });

      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          projectName,
          files,
          framework: detectFramework(files),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Deployment failed');
      }

      setDeployState({ status: 'building', message: STATUS_MESSAGES.building });
      await new Promise(r => setTimeout(r, 1000));

      setDeployState({ status: 'deploying', message: STATUS_MESSAGES.deploying });
      await new Promise(r => setTimeout(r, 500));

      if (data.url) {
        setDeployState({ 
          status: 'success', 
          message: STATUS_MESSAGES.success,
          url: data.url 
        });
      } else {
        throw new Error('No deployment URL returned');
      }
    } catch (error: any) {
      setDeployState({ 
        status: 'error', 
        message: STATUS_MESSAGES.error,
        error: error.message 
      });
    }
  }

  function detectFramework(files: Record<string, string>): string {
    const fileNames = Object.keys(files);
    if (fileNames.some(f => f.includes('next.config'))) return 'nextjs';
    if (fileNames.some(f => f.includes('vite.config'))) return 'vite';
    if (fileNames.some(f => f.includes('remix.config'))) return 'remix';
    if (fileNames.some(f => f.includes('astro.config'))) return 'astro';
    if (fileNames.some(f => f.includes('nuxt.config'))) return 'nuxt';
    return 'static';
  }

  function resetAndClose() {
    setIsOpen(false);
    setDeployState({ status: 'idle', message: '' });
    setSelectedPlatform(null);
  }

  const fileCount = Object.keys(files).length;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={disabled || fileCount === 0}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        <Rocket className="w-4 h-4" />
        <span>Deploy</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-50" onClick={!isDeploying ? resetAndClose : undefined} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-xl p-6 max-w-md w-full shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
                  <Rocket className="w-5 h-5 text-purple-500" />
                  Deploy Project
                </h3>
                {!isDeploying && (
                  <button onClick={resetAndClose} className="p-1 hover:bg-bolt-elements-background-depth-2 rounded">
                    <X className="w-5 h-5 text-bolt-elements-textSecondary" />
                  </button>
                )}
              </div>

              {/* Project Info */}
              <div className="mb-6 p-3 bg-bolt-elements-background-depth-2 rounded-lg">
                <div className="text-sm text-bolt-elements-textSecondary">Project</div>
                <div className="font-medium text-bolt-elements-textPrimary">{projectName}</div>
                <div className="text-xs text-bolt-elements-textSecondary mt-1">
                  {fileCount} files • {detectFramework(files)}
                </div>
              </div>

              {/* Success State */}
              {deployState.status === 'success' && deployState.url && (
                <div className="space-y-4">
                  <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <div className="flex items-center gap-2 text-green-500 mb-2">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Deployed Successfully!</span>
                    </div>
                    <a
                      href={deployState.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 break-all"
                    >
                      <Globe className="w-4 h-4 flex-shrink-0" />
                      {deployState.url}
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                    </a>
                  </div>
                  <button
                    onClick={resetAndClose}
                    className="w-full px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-lg hover:bg-bolt-elements-button-primary-backgroundHover"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* Error State */}
              {deployState.status === 'error' && (
                <div className="space-y-4">
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <div className="flex items-center gap-2 text-red-500 mb-2">
                      <XCircle className="w-5 h-5" />
                      <span className="font-medium">Deployment Failed</span>
                    </div>
                    <p className="text-sm text-bolt-elements-textSecondary">{deployState.error}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeployState({ status: 'idle', message: '' })}
                      className="flex-1 px-4 py-2 border border-bolt-elements-borderColor rounded-lg hover:bg-bolt-elements-background-depth-2"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={resetAndClose}
                      className="flex-1 px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-lg"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}

              {/* Deploying State */}
              {isDeploying && (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-3 py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
                    <span className="text-bolt-elements-textPrimary">{deployState.message}</span>
                  </div>
                  <div className="flex gap-1">
                    {['preparing', 'uploading', 'building', 'deploying'].map((step, i) => (
                      <div
                        key={step}
                        className={`flex-1 h-1 rounded-full transition-colors ${
                          ['preparing', 'uploading', 'building', 'deploying'].indexOf(deployState.status) >= i
                            ? 'bg-purple-500'
                            : 'bg-bolt-elements-background-depth-3'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Platform Selection */}
              {deployState.status === 'idle' && (
                <div className="space-y-3">
                  <button
                    onClick={() => handleDeploy('vercel')}
                    className="w-full px-4 py-4 bg-black text-white rounded-lg hover:bg-gray-900 flex items-center justify-center gap-3 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 76 65" fill="currentColor">
                      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                    </svg>
                    <span className="font-medium">Deploy to Vercel</span>
                  </button>
                  <button
                    onClick={() => handleDeploy('netlify')}
                    className="w-full px-4 py-4 bg-[#00C7B7] text-white rounded-lg hover:bg-[#00A896] flex items-center justify-center gap-3 transition-colors"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 40 40" fill="currentColor">
                      <path d="M28.589 14.135l-.014-.006c-.008-.003-.016-.006-.023-.013a.11.11 0 01-.028-.093l.773-4.726 3.625 3.626-3.77 1.604a.083.083 0 01-.063-.392z" />
                    </svg>
                    <span className="font-medium">Deploy to Netlify</span>
                  </button>
                  <p className="text-xs text-center text-bolt-elements-textSecondary mt-4">
                    Your project will be deployed to a public URL
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
