import { useState, useEffect } from 'react';
import { GitBranch, Github, Settings, Loader2, X } from 'lucide-react';
import { ProjectActions } from '~/components/project/ProjectActions';

interface GitHubBarProps {
  chatId: string;
  projectId?: string;
  projectName?: string;
}

export function GitHubBar({ chatId, projectId, projectName }: GitHubBarProps) {
  const [connected, setConnected] = useState(false);
  const [repo, setRepo] = useState<string | null>(null);
  const [branch, setBranch] = useState('main');
  const [syncing, setSyncing] = useState(false);
  const [showRepoSelector, setShowRepoSelector] = useState(false);

  useEffect(() => {
    loadGitHubStatus();
  }, [chatId]);

  async function loadGitHubStatus() {
    try {
      const response = await fetch(`/api/chat/${chatId}/github?action=status`);
      const data: any = await response.json();
      if (data.connected) {
        setConnected(true);
        setRepo(data.repo);
        setBranch(data.branch);
      }
    } catch (error) {
      console.error('Failed to load GitHub status:', error);
    }
  }

  async function connectRepo(repoName: string) {
    setSyncing(true);
    try {
      await fetch(`/api/chat/${chatId}/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', repo: repoName })
      });
      setConnected(true);
      setRepo(repoName);
    } catch (error) {
      console.error('Failed to connect repo:', error);
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    try {
      await fetch(`/api/chat/${chatId}/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' })
      });
      setConnected(false);
      setRepo(null);
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  }

  if (!connected) {
    return (
      <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2">
        <button
          onClick={() => setShowRepoSelector(true)}
          className="flex items-center gap-2 text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
        >
          <Github size={16} />
          Connect GitHub Repository
        </button>

        {showRepoSelector && (
          <RepoSelectorModal
            onClose={() => setShowRepoSelector(false)}
            onSelect={(repo) => {
              connectRepo(repo);
              setShowRepoSelector(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2">
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2 text-bolt-elements-textPrimary">
          <Github size={16} />
          <span className="font-medium">{repo}</span>
        </div>

        <div className="flex items-center gap-1 text-bolt-elements-textSecondary">
          <GitBranch size={14} />
          <span>{branch}</span>
        </div>

        {syncing && (
          <div className="flex items-center gap-1 text-bolt-elements-textSecondary">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Syncing...</span>
          </div>
        )}

        {/* Project Export Actions */}
        {projectId && (
          <div className="flex items-center gap-2 ml-auto mr-2">
            <ProjectActions
              projectId={projectId}
              projectName={projectName}
              variant="icons"
            />
          </div>
        )}

        <button
          onClick={disconnect}
          className="p-1 hover:bg-bolt-elements-item-backgroundActive rounded transition-colors"
          title="Disconnect"
        >
          <X size={14} className="text-bolt-elements-textSecondary" />
        </button>
      </div>
    </div>
  );
}

function RepoSelectorModal({ onClose, onSelect }: { onClose: () => void; onSelect: (repo: string) => void }) {
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadRepos();
  }, []);

  async function loadRepos() {
    try {
      const response = await fetch('/api/github/repos');
      const data = await response.json();
      setRepos(data.repos || []);
    } catch (error) {
      console.error('Failed to load repos:', error);
    } finally {
      setLoading(false);
    }
  }

  const filtered = repos.filter(r =>
    r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-bolt-elements-background-depth-2 rounded-lg p-6 w-[500px] max-w-full max-h-[600px] flex flex-col" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4 text-bolt-elements-textPrimary">Connect GitHub Repository</h2>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search repositories..."
          className="w-full px-3 py-2 mb-4 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary"
        />

        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <div className="text-center py-8 text-bolt-elements-textSecondary">Loading repositories...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-bolt-elements-textSecondary">No repositories found</div>
          ) : (
            filtered.map(repo => (
              <button
                key={repo.id}
                onClick={() => onSelect(repo.full_name)}
                className="w-full flex items-start gap-3 p-3 hover:bg-bolt-elements-item-backgroundActive rounded transition-colors text-left"
              >
                <Github size={20} className="text-bolt-elements-textSecondary mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-bolt-elements-textPrimary">{repo.name}</div>
                  {repo.description && (
                    <div className="text-sm text-bolt-elements-textSecondary truncate">{repo.description}</div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 text-sm text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundActive rounded"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
