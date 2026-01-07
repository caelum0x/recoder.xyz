import { useState, useEffect } from 'react';
import { ProjectActions } from '~/components/project/ProjectActions';
import { toast } from 'react-hot-toast';

interface GitHubBarProps {
  chatId: string;
  projectId?: string;
  projectName?: string;
  onFilesLoaded?: (files: any[]) => void;
  getCurrentFiles?: () => any[];
}

export function GitHubBar({ chatId, projectId, projectName, onFilesLoaded, getCurrentFiles }: GitHubBarProps) {
  const [connected, setConnected] = useState(false);
  const [repo, setRepo] = useState<string | null>(null);
  const [branch, setBranch] = useState('main');
  const [syncing, setSyncing] = useState(false);
  const [showRepoSelector, setShowRepoSelector] = useState(false);
  const [repoInput, setRepoInput] = useState('');

  useEffect(() => {
    loadGitHubStatus();
  }, [chatId]);

  async function loadGitHubStatus() {
    try {
      const response = await fetch(`/api/chat/${chatId}/github?action=status`);
      const data: any = await response.json() as { error?: string; [key: string]: any };
      if (data.connected) {
        setConnected(true);
        setRepo(data.repo);
        setBranch(data.branch);
      }
    } catch (error) {
      console.error('Failed to load GitHub status:', error);
    }
  }

  async function syncWithGitHub() {
    setSyncing(true);
    try {
      // First pull latest changes
      const pullResponse = await fetch(`/api/chat/${chatId}/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pull' })
      });

      const pullData = await pullResponse.json() as { error?: string; files?: any[] };
      
      if (!pullResponse.ok) {
        throw new Error(pullData.error || 'Failed to pull changes');
      }

      if (pullData.files && onFilesLoaded) {
        onFilesLoaded(pullData.files);
      }

      // Then push local changes if any
      if (getCurrentFiles) {
        const localFiles = getCurrentFiles();
        if (localFiles.length > 0) {
          const pushResponse = await fetch(`/api/chat/${chatId}/github`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              action: 'push', 
              files: localFiles, 
              message: 'Sync from Recoder AI',
              branch 
            })
          });

          const pushData = await pushResponse.json() as { error?: string };
          
          if (!pushResponse.ok) {
            throw new Error(pushData.error || 'Failed to push changes');
          }
        }
      }
      
      toast.success('Synced with GitHub!');
    } catch (error: any) {
      console.error('Failed to sync:', error);
      toast.error(error.message || 'Failed to sync with GitHub');
    } finally {
      setSyncing(false);
    }
  }

  async function cloneRepo() {
    if (!repoInput.trim()) {
      toast.error('Please enter a repository URL or owner/repo');
      return;
    }

    setSyncing(true);
    try {
      // Extract owner/repo from URL or use as-is
      let repoPath = repoInput.trim();
      if (repoPath.includes('github.com/')) {
        const match = repoPath.match(/github\.com\/([^\/]+\/[^\/]+)/);
        if (match) repoPath = match[1];
      }
      repoPath = repoPath.replace(/\.git$/, '');

      const response = await fetch(`/api/chat/${chatId}/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clone', repo: repoPath, branch })
      });

      const data = await response.json() as { error?: string; [key: string]: any };
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to clone repository');
      }

      setConnected(true);
      setRepo(repoPath);
      setShowRepoSelector(false);
      
      if (data.files && onFilesLoaded) {
        onFilesLoaded(data.files);
      }
      
      toast.success(`Cloned ${repoPath} successfully!`);
    } catch (error: any) {
      console.error('Failed to clone repo:', error);
      toast.error(error.message || 'Failed to clone repository');
    } finally {
      setSyncing(false);
    }
  }

  async function pullChanges() {
    setSyncing(true);
    try {
      const response = await fetch(`/api/chat/${chatId}/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pull' })
      });

      const data = await response.json() as { error?: string; [key: string]: any };
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to pull changes');
      }

      if (data.files && onFilesLoaded) {
        onFilesLoaded(data.files);
      }
      
      toast.success('Pulled latest changes!');
    } catch (error: any) {
      console.error('Failed to pull:', error);
      toast.error(error.message || 'Failed to pull changes');
    } finally {
      setSyncing(false);
    }
  }

  async function pushChanges(files: any[], message: string) {
    setSyncing(true);
    try {
      const response = await fetch(`/api/chat/${chatId}/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'push', files, message, branch })
      });

      const data = await response.json() as { error?: string; [key: string]: any };
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to push changes');
      }
      
      toast.success('Pushed changes to GitHub!');
    } catch (error: any) {
      console.error('Failed to push:', error);
      toast.error(error.message || 'Failed to push changes');
    } finally {
      setSyncing(false);
    }
  }

  async function disconnectRepo() {
    try {
      await fetch(`/api/chat/${chatId}/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' })
      });
      setConnected(false);
      setRepo(null);
      toast.success('Disconnected from GitHub');
    } catch (error) {
      console.error('Failed to disconnect:', error);
      toast.error('Failed to disconnect');
    }
  }

  if (!connected) {
    return (
      <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2">
        {!showRepoSelector ? (
          <button
            onClick={() => setShowRepoSelector(true)}
            className="flex items-center gap-2 text-sm text-black dark:text-white hover:text-orange-500 transition-colors font-medium"
          >
            <span className="i-ph:github-logo text-base" />
            Connect GitHub Repository
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="https://github.com/owner/repo or owner/repo"
              className="flex-1 px-3 py-1.5 text-sm bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus"
              onKeyDown={(e) => e.key === 'Enter' && cloneRepo()}
            />
            <button
              onClick={cloneRepo}
              disabled={syncing}
              className="px-3 py-1.5 text-sm bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded hover:bg-bolt-elements-button-primary-backgroundHover disabled:opacity-50"
            >
              {syncing ? <span className="i-ph:spinner text-sm animate-spin" /> : 'Clone'}
            </button>
            <button
              onClick={() => setShowRepoSelector(false)}
              className="p-1.5 hover:bg-bolt-elements-item-backgroundActive rounded"
            >
              <span className="i-ph:x text-sm" />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2">
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2 text-bolt-elements-textPrimary">
          <span className="i-ph:github-logo text-base" />
          <span className="font-medium">{repo}</span>
        </div>

        <div className="flex items-center gap-1 text-bolt-elements-textSecondary">
          <span className="i-ph:git-branch text-sm" />
          <span>{branch}</span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={syncWithGitHub}
            disabled={syncing}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover rounded disabled:opacity-50"
            title="Sync (pull + push)"
          >
            <span className={`i-ph:arrows-clockwise text-xs ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </button>

          <button
            onClick={pullChanges}
            disabled={syncing}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-bolt-elements-button-secondary-background hover:bg-bolt-elements-button-secondary-backgroundHover rounded disabled:opacity-50"
            title="Pull latest changes"
          >
            <span className="i-ph:download-simple text-xs" />
            Pull
          </button>

          <button
            onClick={disconnectRepo}
            className="p-1 hover:bg-bolt-elements-item-backgroundActive rounded transition-colors"
            title="Disconnect"
          >
            <span className="i-ph:x text-sm text-bolt-elements-textSecondary" />
          </button>
        </div>
      </div>
    </div>
  );
}

