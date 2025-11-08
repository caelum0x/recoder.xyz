/**
 * ProjectInfo Component
 * Shows CLI integration info to continue project in terminal
 */

import { useState } from 'react';
import { toast } from 'react-toastify';

interface ProjectInfoProps {
  urlId: string;
}

export function ProjectInfo({ urlId }: ProjectInfoProps) {
  const [copied, setCopied] = useState(false);

  const commands = {
    list: 'recoder projects list',
    open: `recoder projects open ${urlId}`,
    download: `recoder projects download ${urlId}`,
    info: `recoder projects info ${urlId}`,
  };

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    toast.success('Command copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gradient-to-r from-orange-50 to-purple-50 dark:from-orange-950/20 dark:to-purple-950/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="i-ph:terminal-window text-orange-600 dark:text-orange-400 text-2xl mt-1 flex-shrink-0" />

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-bolt-elements-textPrimary mb-2">
            🚀 Continue in Terminal
          </h3>

          <p className="text-sm text-bolt-elements-textSecondary mb-3">
            Download this project and continue coding locally with full file system access!
          </p>

          <div className="space-y-2">
            {/* Download Command - Primary */}
            <div className="bg-white dark:bg-bolt-elements-background-depth-3 rounded p-3 border border-bolt-elements-borderColor">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-bolt-elements-textTertiary">Download to Local:</span>
                <button
                  onClick={() => copyCommand(commands.download)}
                  className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium"
                >
                  {copied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
              <code className="text-xs font-mono text-bolt-elements-textPrimary break-all">
                {commands.download}
              </code>
            </div>

            {/* Other Commands - Collapsed */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary flex items-center gap-1">
                <span className="i-ph:caret-right group-open:rotate-90 transition-transform" />
                More CLI Commands
              </summary>

              <div className="mt-2 space-y-2 pl-4">
                <div className="bg-white dark:bg-bolt-elements-background-depth-3 rounded p-2 border border-bolt-elements-borderColor">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-bolt-elements-textTertiary">List Projects:</span>
                    <button
                      onClick={() => copyCommand(commands.list)}
                      className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300"
                    >
                      Copy
                    </button>
                  </div>
                  <code className="text-xs font-mono text-bolt-elements-textSecondary">
                    {commands.list}
                  </code>
                </div>

                <div className="bg-white dark:bg-bolt-elements-background-depth-3 rounded p-2 border border-bolt-elements-borderColor">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-bolt-elements-textTertiary">Project Info:</span>
                    <button
                      onClick={() => copyCommand(commands.info)}
                      className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300"
                    >
                      Copy
                    </button>
                  </div>
                  <code className="text-xs font-mono text-bolt-elements-textSecondary">
                    {commands.info}
                  </code>
                </div>
              </div>
            </details>
          </div>

          <div className="mt-3 pt-3 border-t border-orange-200 dark:border-orange-800">
            <p className="text-xs text-bolt-elements-textTertiary">
              💡 <span className="font-medium">First time?</span> Install CLI: <code className="text-orange-600 dark:text-orange-400">npm install -g recoder-cli</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
