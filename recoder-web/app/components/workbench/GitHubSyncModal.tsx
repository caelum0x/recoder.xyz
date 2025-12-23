import { memo, useState } from 'react';
import { toast } from 'react-toastify';
import { IconButton } from '~/components/ui/IconButton';
import { classNames } from '~/utils/classNames';

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
    try {
      const response = await fetch('/api/github/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, accessToken }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to clone repository');
      }

      onFilesUpdate(result.files);
      toast.success(`Cloned ${result.fileCount} files from ${result.repoInfo.fullName}`);
      onClose();
    } catch (error: any) {
      toast.error(`Clone failed: ${error.message}`);
    } finally {
      setIsLoading(false);
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

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to pull from repository');
      }

      onFilesUpdate(result.files);
      toast.success(`Pulled ${result.fileCount} files from ${owner}/${repo}`);
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
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to sync with repository');
      }

      if (syncMode !== 'push') {
        onFilesUpdate(result.files);
      }

      toast.success(
        <div>
          {result.message}
          {result.syncResult.conflicts.length > 0 && (
            <div className="text-xs mt-1">
              <span className="i-ph:warning" /> {result.syncResult.conflicts.length} conflicts (local changes kept)
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

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to get repository info');
      }

      setRepoInfo(result);
      setShowInfo(true);
    } catch (error: any) {
      toast.error(`Failed to get info: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-bolt-elements-borderColor">
          <h2 className="text-lg font-semibold">GitHub Sync</h2>
          <IconButton icon="i-ph:x" onClick={onClose} />
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Action</label>
            <div className="grid grid-cols-4 gap-2">
              {(['clone', 'pull', 'push', 'sync'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {setMode(m); setShowInfo(false);}}
                  className={classNames(
                    'px-4 py-2 rounded text-sm font-medium transition-colors',
                    mode === m
                      ? 'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text'
                      : 'bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4'
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
                <label className="block text-sm font-medium mb-2">Repository URL</label>
                <input
                  type="text"
                  value={repoUrl}
                  onChange={(e) => {
                    setRepoUrl(e.target.value);
                    parseRepoUrl(e.target.value);
                  }}
                  placeholder="https://github.com/owner/repo"
                  className="w-full px-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Access Token (optional for public repos)
                </label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full px-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded"
                />
              </div>
            </div>
          )}

          {/* Pull/Push/Sync Mode */}
          {(mode === 'pull' || mode === 'push' || mode === 'sync') && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Owner</label>
                  <input
                    type="text"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="username"
                    className="w-full px-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Repository</label>
                  <input
                    type="text"
                    value={repo}
                    onChange={(e) => setRepo(e.target.value)}
                    placeholder="repo-name"
                    className="w-full px-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Branch</label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full px-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Access Token</label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full px-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded"
                />
                <p className="text-xs text-bolt-elements-textSecondary mt-1">
                  Create at:{' '}
                  <a
                    href="https://github.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    github.com/settings/tokens
                  </a>
                </p>
              </div>
            </div>
          )}

          {/* Repository Info */}
          {showInfo && repoInfo && (
            <div className="p-4 bg-bolt-elements-background-depth-3 rounded space-y-2">
              <h3 className="font-semibold">{repoInfo.repository.fullName}</h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                {repoInfo.repository.description}
              </p>
              <div className="flex gap-4 text-sm">
                <span>⭐ {repoInfo.repository.stars}</span>
                <span>🍴 {repoInfo.repository.forks}</span>
                <span><span className="i-ph:git-branch" /> {repoInfo.branches.length} branches</span>
              </div>
              <div className="text-xs text-bolt-elements-textSecondary">
                Last updated: {new Date(repoInfo.repository.updatedAt).toLocaleDateString()}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {mode === 'clone' && (
              <button
                onClick={handleClone}
                disabled={isLoading || !repoUrl}
                className="flex-1 px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded font-medium disabled:opacity-50"
              >
                {isLoading ? 'Cloning...' : 'Clone Repository'}
              </button>
            )}
            {mode === 'pull' && (
              <>
                <button
                  onClick={handleGetInfo}
                  disabled={isLoading || !owner || !repo || !accessToken}
                  className="px-4 py-2 bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4 rounded font-medium"
                >
                  Get Info
                </button>
                <button
                  onClick={handlePull}
                  disabled={isLoading || !owner || !repo || !accessToken}
                  className="flex-1 px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded font-medium disabled:opacity-50"
                >
                  {isLoading ? 'Pulling...' : 'Pull Changes'}
                </button>
              </>
            )}
            {mode === 'push' && (
              <button
                onClick={() => handleSync('push')}
                disabled={isLoading || !owner || !repo || !accessToken}
                className="flex-1 px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded font-medium disabled:opacity-50"
              >
                {isLoading ? 'Pushing...' : 'Push Changes'}
              </button>
            )}
            {mode === 'sync' && (
              <>
                <button
                  onClick={() => handleSync('pull')}
                  disabled={isLoading || !owner || !repo || !accessToken}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
                >
                  {isLoading ? 'Syncing...' : '↓ Pull Only'}
                </button>
                <button
                  onClick={() => handleSync('push')}
                  disabled={isLoading || !owner || !repo || !accessToken}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium disabled:opacity-50"
                >
                  {isLoading ? 'Syncing...' : '↑ Push Only'}
                </button>
                <button
                  onClick={() => handleSync('both')}
                  disabled={isLoading || !owner || !repo || !accessToken}
                  className="flex-1 px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded font-medium disabled:opacity-50"
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
