/**
 * CLI Status Indicator for Terminal
 */

import { useRecoderCLI } from '~/hooks/useRecoderCLI';

export function CLIStatus() {
  const { isInstalled, isInstalling, error } = useRecoderCLI();

  if (isInstalling) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 text-xs bg-bolt-elements-background-depth-2 border-l border-bolt-elements-borderColor">
        <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress" />
        <span className="text-bolt-elements-textSecondary">Installing recoder CLI...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 text-xs bg-bolt-elements-background-depth-2 border-l border-bolt-elements-borderColor">
        <div className="i-ph:warning text-bolt-elements-icon-error" />
        <span className="text-bolt-elements-textSecondary">CLI install failed</span>
      </div>
    );
  }

  if (isInstalled) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 text-xs bg-bolt-elements-background-depth-2 border-l border-bolt-elements-borderColor">
        <div className="i-ph:check-circle text-bolt-elements-icon-success" />
        <span className="text-bolt-elements-textSecondary">recoder CLI ready</span>
      </div>
    );
  }

  return null;
}
