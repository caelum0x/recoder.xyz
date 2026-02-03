import { memo, useState } from 'react';
import { toast } from 'react-toastify';
import { IconButton } from '~/components/ui/IconButton';
import { classNames } from '~/utils/classNames';

interface GitHubApiResult {
  error?: string;
  files?: Record<string, string>;
  fileCount?: number;
  repoInfo?: { fullName: string };
  message?: string;
  syncResult?: { conflicts: string[] };
}

interface GitHubSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: Record<string, any>;
  onFilesUpdate: (files: Record<string, string>) => void;
}

type SyncMode = 'clone' | 'pull' | 'push' | 'sync';

export const GitHubSyncModal = memo(({ isOpen, onClose, files, onFilesUpdate }: GitHubSyncModalProps) => {
  const [mode, setMode] = useState<SyncMode>('sync');
  const [repoUrl, setRepoUrl] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [accessToken, setAccessToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [repoInfo, setRepoInfo] = useState<any>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [status, setStatus] = useState<string>('');

  if (!isOpen) return null;

  const parseRepoUrl = (url: string) => {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (match) {
      setOwner(match[1]);
      setRepo(match[2].replace('.git', ''));
    }
  };

  const handleClone = async () => {
    setIsLoading(true);
    setStatus('Connecting to GitHub...');
    try {
      setStatus('Fetching repository...');
      const response = await fetch('/api/github/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, accessToken }),
      });

      const result = await response.json() as GitHubApiResult;

      if (!response.ok) {
        throw new Error(result.error || 'Failed to clone repository');
      }
      setStatus('Processing files...');

      if (result.files) onFilesUpdate(result.files);
      toast.success(`Cloned ${result.fileCount || 0} files from ${result.repoInfo?.fullName || 'repository'}`);
      onClose();
    } catch (error: any) {
      toast.error(`Clone failed: ${error.message}`);
    } finally {
      setIsLoading(false);
      setStatus('');
    }
  };

  const handlePull = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/github/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo, branch, accessToken }),
      });

      const result = await response.json() as GitHubApiResult;

      if (!response.ok) {
        throw new Error(result.error || 'Failed to pull from repository');
      }

      if (result.files) onFilesUpdate(result.files);
      toast.success(`Pulled ${result.fileCount || 0} files from ${owner}/${repo}`);
      onClose();
    } catch (error: any) {
      toast.error(`Pull failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async (syncMode: 'pull' | 'push' | 'both') => {
    setIsLoading(true);
    try {
      const filesToSync: Record<string, string> = {};
      Object.entries(files).forEach(([path, file]) => {
        if (file.type === 'file') {
          filesToSync[path] = file.content;
        }
      });

      const response = await fetch('/api/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          repo,
          branch,
          localFiles: filesToSync,
          accessToken,
          syncMode,
          commitMessage: commitMessage || `Update from Recoder - ${new Date().toISOString()}`,
        }),
      });

      const result = await response.json() as GitHubApiResult;

      if (!response.ok) {
        throw new Error(result.error || 'Failed to sync with repository');
      }

      if (syncMode !== 'push' && result.files) {
        onFilesUpdate(result.files);
      }

      toast.success(
        <div>
          {result.message}
          {(result.syncResult?.conflicts?.length || 0) > 0 && (
            <div className="text-xs mt-1">
              <span className="i-ph:warning" /> {result.syncResult?.conflicts?.length} conflicts (local changes kept)
            </div>
          )}
        </div>
      );
      onClose();
    } catch (error: any) {
      toast.error(`Sync failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGetInfo = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/github/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo, accessToken }),
      });

      const result = await response.json() as GitHubApiResult & Record<string, unknown>;

      if (!response.ok) {
        throw new Error(result.error || 'Failed to get repository info');
      }

      setRepoInfo(result as Record<string, unknown>);
      setShowInfo(true);
    } catch (error: any) {
      toast.error(`Failed to get info: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-bolt-elements-borderColor bg-gradient-to-r from-purple-900/30 to-orange-900/30">
          <h2 className="text-lg font-semibold text-bolt-elements-textPrimary flex items-center gap-2">
            <span className="i-ph:github-logo text-xl" />
            GitHub Sync
          </h2>
          <IconButton icon="i-ph:x" onClick={onClose} />
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium mb-2 text-bolt-elements-textSecondary">Action</label>
            <div className="grid grid-cols-4 gap-2">
              {(['clone', 'pull', 'push', 'sync'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {setMode(m); setShowInfo(false);}}
                  className={classNames(
                    'px-4 py-2 rounded text-sm font-medium transition-colors',
                    mode === m
                      ? 'bg-orange-500 text-white'
                      : 'bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary'
                  )}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Clone Mode */}
          {mode === 'clone' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-bolt-elements-textSecondary">Repository URL</label>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => {
                    setRepoUrl(e.target.value);
                    parseRepoUrl(e.target.value);
                  }}
                  placeholder="https://github.com/owner/repo"
                  className="w-full px-3 py-2 text-bolt-elements-textPrimary bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded placeholder:text-bolt-elements-textTertiary focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-bolt-elements-textSecondary">
                  Access Token (optional for public repos)
                </label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full px-3 py-2 text-bolt-elements-textPrimary bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded placeholder:text-bolt-elements-textTertiary focus:border-orange-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Pull/Push/Sync Mode */}
          {(mode === 'pull' || mode === 'push' || mode === 'sync') && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-bolt-elements-textSecondary">Owner</label>
                  <input
                    type="text"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="username"
                    className="w-full px-3 py-2 text-bolt-elements-textPrimary bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded placeholder:text-bolt-elements-textTertiary focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-bolt-elements-textSecondary">Repository</label>
                  <input
                    type="text"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    placeholder="repo-name"
                    className="w-full px-3 py-2 text-bolt-elements-textPrimary bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded placeholder:text-bolt-elements-textTertiary focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-bolt-elements-textSecondary">Branch</label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full px-3 py-2 text-bolt-elements-textPrimary bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded placeholder:text-bolt-elements-textTertiary focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-bolt-elements-textSecondary">Access Token</label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full px-3 py-2 text-bolt-elements-textPrimary bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded placeholder:text-bolt-elements-textTertiary focus:border-orange-500 focus:outline-none"
                />
                <p className="text-xs text-bolt-elements-textTertiary mt-1">
                  Create at:{' '}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-400 underline hover:text-orange-300"
                  >
                    github.com/settings/tokens
                  </a>
                </p>
              </div>
              {(mode === 'push' || mode === 'sync') && (
                <div>
                  <label className="block text-sm font-medium mb-2 text-bolt-elements-textSecondary">Commit Message</label>
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Update from Recoder"
                    className="w-full px-3 py-2 text-bolt-elements-textPrimary bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded placeholder:text-bolt-elements-textTertiary focus:border-orange-500 focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          {/* Repository Info */}
          {showInfo && repoInfo && (
            <div className="p-4 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg space-y-2">
              <h3 className="font-semibold text-bolt-elements-textPrimary">{repoInfo.repository.fullName}</h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                {repoInfo.repository.description}
              </p>
              <div className="flex gap-4 text-sm text-bolt-elements-textSecondary">
                <span>⭐ {repoInfo.repository.stars}</span>
                <span>🍴 {repoInfo.repository.forks}</span>
                <span><span className="i-ph:git-branch text-purple-400" /> {repoInfo.branches.length} branches</span>
              </div>
              <div className="text-xs text-bolt-elements-textTertiary">
                Last updated: {new Date(repoInfo.repository.updatedAt).toLocaleDateString()}
              </div>
            </div>
          )}

          {/* Status Indicator */}
          {isLoading && status && (
            <div className="flex items-center gap-2 p-3 bg-purple-900/20 border border-purple-700/50 rounded-lg">
              <div className="animate-spin w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full" />
              <span className="text-sm text-purple-300">{status}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {mode === 'clone' && (
              <button
                onClick={handleClone}
                disabled={isLoading || !repoUrl}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium disabled:opacity-50"
              >
                {isLoading ? 'Cloning...' : 'Clone Repository'}
              </button>
            )}
            {mode === 'pull' && (
              <>
                <button
                  onClick={handleGetInfo}
                  disabled={isLoading || !owner || !repo || !accessToken}
                  className="px-4 py-2 bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary rounded font-medium"
                >
                  Get Info
                </button>
                <button
                  onClick={handlePull}
                  disabled={isLoading || !owner || !repo || !accessToken}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium disabled:opacity-50"
                >
                  {isLoading ? 'Pulling...' : 'Pull Changes'}
                </button>
              </>
            )}
            {mode === 'push' && (
              <button
                onClick={() => handleSync('push')}
                disabled={isLoading || !owner || !repo || !accessToken}
                className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded font-medium disabled:opacity-50"
              >
                {isLoading ? 'Pushing...' : 'Push Changes'}
              </button>
            )}
            {mode === 'sync' && (
              <>
                <button
                  onClick={() => handleSync('pull')}
                  disabled={isLoading || !owner || !repo || !accessToken}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium disabled:opacity-50"
                >
                  {isLoading ? 'Syncing...' : '↓ Pull Only'}
                </button>
                <button
                  onClick={() => handleSync('push')}
                  disabled={isLoading || !owner || !repo || !accessToken}
                  className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded font-medium disabled:opacity-50"
                >
                  {isLoading ? 'Syncing...' : '↑ Push Only'}
                </button>
                <button
                  onClick={() => handleSync('both')}
                  disabled={isLoading || !owner || !repo || !accessToken}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-orange-500 hover:from-purple-700 hover:to-orange-600 text-white rounded font-medium disabled:opacity-50"
                >
                  {isLoading ? 'Syncing...' : '⇅ Sync Both'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
