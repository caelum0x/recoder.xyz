import { useState } from 'react';
import type { ApiResponse } from "~/types/api-responses";

interface DeployButtonProps {
  files: Record<string, string>;
  projectName: string;
}

export function DeployButton({ files, projectName }: DeployButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployUrl, setDeployUrl] = useState('');

  async function handleDeploy(platform: 'vercel' | 'netlify') {
    setDeploying(true);
    try {
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          projectName,
          files,
          framework: 'nextjs',
        }),
      });

      const data = await res.json();
      if (data.url) {
        setDeployUrl(data.url);
      }
    } catch (error) {
      console.error('Deploy failed:', error);
    }
    setDeploying(false);
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-lg hover:bg-bolt-elements-button-primary-backgroundHover"
      >
        <div className="i-ph:rocket-launch" />
        <span>Deploy</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setIsOpen(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-bolt-elements-textPrimary mb-4">
                Deploy Your Project
              </h3>

              {deployUrl ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-500/10 border border-green-500/20 rounded">
                    <p className="text-sm text-green-600 mb-2">✓ Deployed successfully!</p>
                    <a
                      href={deployUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-500 hover:underline break-all"
                    >
                      {deployUrl}
                    </a>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="w-full px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-lg"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => handleDeploy('vercel')}
                    disabled={deploying}
                    className="w-full px-4 py-3 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <span>Deploy to Vercel</span>
                  </button>
                  <button
                    onClick={() => handleDeploy('netlify')}
                    disabled={deploying}
                    className="w-full px-4 py-3 bg-[#00C7B7] text-white rounded-lg hover:bg-[#00A896] disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <span>Deploy to Netlify</span>
                  </button>
                  {deploying && (
                    <p className="text-sm text-center text-bolt-elements-textSecondary">
                      Deploying...
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
