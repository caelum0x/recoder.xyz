/**
 * Deployment Modal Component
 * Main modal for configuring and triggering deployments
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogRoot, DialogTitle, DialogDescription } from '~/components/ui/Dialog';
import { IconButton } from '~/components/ui/IconButton';
import { PlatformSelector } from './PlatformSelector';
import { DeploymentProgress } from './DeploymentProgress';
import { workbenchStore } from '~/lib/stores/workbench';
import type { DeploymentPlatform, ProjectDetection } from '~/lib/.server/deployment/types';

interface DeploymentModalProps {
  open: boolean;
  onClose: () => void;
}

export function DeploymentModal({ open, onClose }: DeploymentModalProps) {
  const [step, setStep] = useState<'platform' | 'auth' | 'config' | 'deploying' | 'complete'>('platform');
  const [selectedPlatform, setSelectedPlatform] = useState<DeploymentPlatform>('vercel');
  const [projectName, setProjectName] = useState('my-project');
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [detection, setDetection] = useState<ProjectDetection | null>(null);
  const [deploymentResult, setDeploymentResult] = useState<any>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userToken, setUserToken] = useState<string>('');
  
  // Load saved tokens from localStorage
  useEffect(() => {
    if (open && typeof window !== 'undefined') {
      const savedTokens = localStorage.getItem('deployment_tokens');
      if (savedTokens) {
        try {
          const tokens = JSON.parse(savedTokens);
          if (tokens[selectedPlatform]) {
            setUserToken(tokens[selectedPlatform]);
          }
        } catch (e) {
          console.error('Failed to load saved tokens:', e);
        }
      }
    }
  }, [open, selectedPlatform]);

  // Detect project type when modal opens
  useEffect(() => {
    if (open) {
      detectProjectType();
    }
  }, [open]);

  const detectProjectType = async () => {
    try {
      const files = workbenchStore.files.get();
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'detect',
          files,
        }),
      });

      const result = await response.json();
      if (result.success) {
        setDetection(result.data);
        setSelectedPlatform(result.data.recommendedPlatform);
      }
    } catch (error) {
      console.error('Failed to detect project type:', error);
    }
  };

  const handleDeploy = async () => {
    if (!userToken) {
      setError('Please enter your API token for ' + selectedPlatform);
      return;
    }

    setIsDeploying(true);
    setError(null);
    setStep('deploying');

    try {
      const files = workbenchStore.files.get();
      
      // Save token to localStorage for future use
      if (typeof window !== 'undefined') {
        const savedTokens = JSON.parse(localStorage.getItem('deployment_tokens') || '{}');
        savedTokens[selectedPlatform] = userToken;
        localStorage.setItem('deployment_tokens', JSON.stringify(savedTokens));
      }

      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deploy',
          config: {
            platform: selectedPlatform,
            projectName,
            framework: detection?.type,
            buildCommand: detection?.buildCommand,
            outputDirectory: detection?.outputDir,
            environmentVariables: envVars,
            token: userToken, // Send user token
          },
          files,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setDeploymentResult(result.data);
        setStep('complete');
      } else {
        throw new Error(result.error || 'Deployment failed');
      }
    } catch (error) {
      console.error('Deployment error:', error);
      setError(error instanceof Error ? error.message : 'Deployment failed');
      setStep('config');
    } finally {
      setIsDeploying(false);
    }
  };

  const handleClose = () => {
    if (!isDeploying) {
      setStep('platform');
      setError(null);
      setDeploymentResult(null);
      onClose();
    }
  };

  return (
    <DialogRoot open={open}>
      <Dialog onClose={handleClose}>
        <div className="flex items-center justify-between mb-4">
          <DialogTitle>
            {step === 'platform' && '🚀 Deploy Your Project'}
            {step === 'config' && '⚙️ Configure Deployment'}
            {step === 'deploying' && '🔨 Deploying...'}
            {step === 'complete' && '✅ Deployment Complete!'}
          </DialogTitle>
          {!isDeploying && step !== 'complete' && (
            <IconButton
              icon="i-ph:x"
              onClick={handleClose}
              className="hover:bg-bolt-elements-background-depth-3"
            />
          )}
        </div>

        <div className="space-y-6">
          {/* Step 1: Platform Selection */}
          {step === 'platform' && (
            <>
              <DialogDescription>
                Choose a platform to deploy your {detection?.framework || 'project'} application.
              </DialogDescription>

              <PlatformSelector
                selected={selectedPlatform}
                recommended={detection?.recommendedPlatform}
                onSelect={setSelectedPlatform}
              />

              <div className="flex justify-end gap-2">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-bolt-elements-button-secondary-background hover:bg-bolt-elements-button-secondary-backgroundHover text-bolt-elements-button-secondary-text rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep('config')}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Step 2: Configuration */}
          {step === 'config' && (
            <>
              <div className="space-y-4">
                {/* API Token Input */}
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                    {selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1)} API Token *
                  </label>
                  <input
                    type="password"
                    value={userToken}
                    onChange={(e) => setUserToken(e.target.value)}
                    className="w-full px-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary font-mono text-sm"
                    placeholder={`Enter your ${selectedPlatform} token...`}
                  />
                  <p className="mt-1 text-xs text-bolt-elements-textTertiary">
                    {selectedPlatform === 'vercel' && 'Get your token from https://vercel.com/account/tokens'}
                    {selectedPlatform === 'netlify' && 'Get your token from https://app.netlify.com/user/applications'}
                    {selectedPlatform === 'cloudflare-pages' && 'Get your token from Cloudflare Dashboard → My Profile → API Tokens'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                    Project Name
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full px-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary"
                    placeholder="my-awesome-project"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                    Detected Framework
                  </label>
                  <div className="px-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textSecondary">
                    {detection?.framework || 'Unknown'} ({detection?.confidence ? `${Math.round(detection.confidence * 100)}% confidence` : 'detecting...'})
                  </div>
                </div>

                {detection?.buildCommand && (
                  <div>
                    <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                      Build Command
                    </label>
                    <div className="px-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textSecondary font-mono text-sm">
                      {detection.buildCommand}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm">
                    {error}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setStep('platform')}
                  className="px-4 py-2 bg-bolt-elements-button-secondary-background hover:bg-bolt-elements-button-secondary-backgroundHover text-bolt-elements-button-secondary-text rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleDeploy}
                  disabled={isDeploying}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {isDeploying ? 'Deploying...' : 'Deploy Now'}
                </button>
              </div>
            </>
          )}

          {/* Step 3: Deploying */}
          {step === 'deploying' && (
            <DeploymentProgress platform={selectedPlatform} />
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && deploymentResult && (
            <>
              <div className="text-center py-6">
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="text-2xl font-bold text-bolt-elements-textPrimary mb-2">
                  Deployment Successful!
                </h3>
                <p className="text-bolt-elements-textSecondary mb-6">
                  Your application is now live!
                </p>

                <div className="bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg p-4 mb-4">
                  <div className="text-sm text-bolt-elements-textSecondary mb-2">Your app is live at:</div>
                  <a
                    href={deploymentResult.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:text-blue-600 font-medium break-all"
                  >
                    {deploymentResult.url}
                  </a>
                </div>

                {deploymentResult.buildTime && (
                  <div className="text-sm text-bolt-elements-textTertiary">
                    Deployed in {Math.round(deploymentResult.buildTime / 1000)}s
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => window.open(deploymentResult.url, '_blank')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Open App
                </button>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-bolt-elements-button-primary-background hover:bg-bolt-elements-button-primary-backgroundHover text-bolt-elements-button-primary-text rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </DialogRoot>
  );
}
