/**
 * GitPanel - VS Code style Source Control panel
 * Shows changed files, staging, commit, push/pull
 */

import { memo, useState, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';

interface GitPanelProps {
  files: Record<string, any>;
  onFileSelect?: (filePath: string) => void;
  onShowDiff?: (filePath: string, original: string, modified: string) => void;
}

interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  staged: boolean;
  content: string;
  originalContent?: string;
}

interface GitConfig {
  owner: string;
  repo: string;
  branch: string;
  accessToken: string;
}

interface GitApiResponse {
  files?: Record<string, string>;
  error?: string;
  success?: boolean;
}

export const GitPanel = memo(({ files, onFileSelect, onShowDiff }: GitPanelProps) => {
  const [changedFiles, setChangedFiles] = useState<ChangedFile[]>([]);
  const [stagedFiles, setStagedFiles] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [gitConfig, setGitConfig] = useState<GitConfig | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [remoteFiles, setRemoteFiles] = useState<Record<string, string>>({});

  // Load git config from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('recoder-git-config');
    if (saved) {
      try {
        setGitConfig(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  // Save git config
  const saveGitConfig = useCallback((config: GitConfig) => {
    setGitConfig(config);
    localStorage.setItem('recoder-git-config', JSON.stringify(config));
    setShowConfig(false);
  }, []);

  // Fetch remote files and calculate diff
  const refreshChanges = useCallback(async () => {
    if (!gitConfig) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/github/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: gitConfig.owner,
          repo: gitConfig.repo,
          branch: gitConfig.branch,
          accessToken: gitConfig.accessToken,
        }),
      });

      if (!response.ok) throw new Error('Failed to fetch remote');

      const data = await response.json() as GitApiResponse;
      const remoteFilesData = data.files || {};
      setRemoteFiles(remoteFilesData);

      // Calculate changes
      const changes: ChangedFile[] = [];

      // Check local files against remote
      Object.entries(files).forEach(([path, file]) => {
        if (file.type !== 'file') return;
        const remotePath = path.startsWith('/') ? path : `/${path}`;
        const remoteContent = remoteFilesData[remotePath];

        if (!remoteContent) {
          changes.push({
            path,
            status: 'added',
            staged: stagedFiles.has(path),
            content: file.content,
          });
        } else if (remoteContent !== file.content) {
          changes.push({
            path,
            status: 'modified',
            staged: stagedFiles.has(path),
            content: file.content,
            originalContent: remoteContent,
          });
        }
      });

      // Check for deleted files
      Object.keys(remoteFilesData).forEach((remotePath) => {
        const localPath = remotePath.startsWith('/') ? remotePath : `/${remotePath}`;
        if (!files[localPath] && !files[remotePath.slice(1)]) {
          changes.push({
            path: remotePath,
            status: 'deleted',
            staged: stagedFiles.has(remotePath),
            content: '',
            originalContent: remoteFilesData[remotePath],
          });
        }
      });

      setChangedFiles(changes);
    } catch (error: any) {
      toast.error(`Failed to refresh: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [gitConfig, files, stagedFiles]);

  // Stage/unstage file
  const toggleStage = useCallback((path: string) => {
    setStagedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
    setChangedFiles((prev) =>
      prev.map((f) => (f.path === path ? { ...f, staged: !f.staged } : f))
    );
  }, []);

  // Stage all
  const stageAll = useCallback(() => {
    const allPaths = changedFiles.map((f) => f.path);
    setStagedFiles(new Set(allPaths));
    setChangedFiles((prev) => prev.map((f) => ({ ...f, staged: true })));
  }, [changedFiles]);

  // Unstage all
  const unstageAll = useCallback(() => {
    setStagedFiles(new Set());
    setChangedFiles((prev) => prev.map((f) => ({ ...f, staged: false })));
  }, []);

  // Commit and push staged files
  const commitAndPush = useCallback(async () => {
    if (!gitConfig || stagedFiles.size === 0 || !commitMessage.trim()) {
      toast.error('Please stage files and enter a commit message');
      return;
    }

    setIsLoading(true);
    try {
      const filesToPush: Record<string, string> = {};
      changedFiles
        .filter((f) => f.staged && f.status !== 'deleted')
        .forEach((f) => {
          filesToPush[f.path] = f.content;
        });

      const response = await fetch('/api/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: gitConfig.owner,
          repo: gitConfig.repo,
          branch: gitConfig.branch,
          localFiles: filesToPush,
          accessToken: gitConfig.accessToken,
          syncMode: 'push',
          commitMessage: commitMessage.trim(),
        }),
      });

      if (!response.ok) throw new Error('Failed to push');

      const data = await response.json() as { syncResult?: { pushed?: string[] } };
      toast.success(`Pushed ${data.syncResult?.pushed?.length || 0} files`);
      setCommitMessage('');
      setStagedFiles(new Set());
      refreshChanges();
    } catch (error: any) {
      toast.error(`Push failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [gitConfig, stagedFiles, commitMessage, changedFiles, refreshChanges]);

  // Pull changes
  const pullChanges = useCallback(async () => {
    if (!gitConfig) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/github/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: gitConfig.owner,
          repo: gitConfig.repo,
          branch: gitConfig.branch,
          accessToken: gitConfig.accessToken,
        }),
      });

      if (!response.ok) throw new Error('Failed to pull');

      const data = await response.json() as { fileCount?: number };
      toast.success(`Pulled ${data.fileCount || 0} files`);
      // Note: Caller needs to update files via onFilesUpdate prop
    } catch (error: any) {
      toast.error(`Pull failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [gitConfig]);

  const stagedCount = changedFiles.filter((f) => f.staged).length;
  const unstagedCount = changedFiles.filter((f) => !f.staged).length;

  // No config set
  if (!gitConfig || showConfig) {
    return (
      <GitConfigForm
        initialConfig={gitConfig}
        onSave={saveGitConfig}
        onCancel={() => setShowConfig(false)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-bolt-elements-borderColor">
        <div className="flex items-center gap-2">
          <span className="i-ph:git-branch text-purple-400" />
          <span className="font-medium text-bolt-elements-textPrimary">
            {gitConfig.owner}/{gitConfig.repo}
          </span>
          <span className="text-xs text-bolt-elements-textTertiary">
            ({gitConfig.branch})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={refreshChanges}
            disabled={isLoading}
            className="p-1 hover:bg-bolt-elements-background-depth-3 rounded"
            title="Refresh"
          >
            <span className={classNames('i-ph:arrows-clockwise', isLoading ? 'animate-spin' : '')} />
          </button>
          <button
            onClick={() => setShowConfig(true)}
            className="p-1 hover:bg-bolt-elements-background-depth-3 rounded"
            title="Settings"
          >
            <span className="i-ph:gear" />
          </button>
        </div>
      </div>

      {/* Commit input */}
      <div className="px-3 py-2 border-b border-bolt-elements-borderColor">
        <input
          type="text"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message"
          className="w-full px-2 py-1.5 text-xs bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:border-blue-500 focus:outline-none text-white placeholder:text-gray-500"
          onKeyDown={(e) => e.key === 'Enter' && commitAndPush()}
        />
        <div className="flex gap-1 mt-2">
          <button
            onClick={commitAndPush}
            disabled={isLoading || stagedCount === 0 || !commitMessage.trim()}
            className="flex-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 rounded text-white"
          >
            Commit & Push ({stagedCount})
          </button>
          <button
            onClick={pullChanges}
            disabled={isLoading}
            className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-white"
            title="Pull"
          >
            <span className="i-ph:arrow-down" />
          </button>
        </div>
      </div>

      {/* Staged Changes */}
      {stagedCount > 0 && (
        <div className="border-b border-bolt-elements-borderColor">
          <div className="flex items-center justify-between px-3 py-1.5 bg-bolt-elements-background-depth-2">
            <span className="text-xs font-medium text-green-400">
              Staged Changes ({stagedCount})
            </span>
            <button
              onClick={unstageAll}
              className="text-xs text-bolt-elements-textTertiary hover:text-white"
            >
              Unstage All
            </button>
          </div>
          <div className="max-h-32 overflow-auto">
            {changedFiles
              .filter((f) => f.staged)
              .map((file) => (
                <FileItem
                  key={file.path}
                  file={file}
                  onToggleStage={() => toggleStage(file.path)}
                  onSelect={() => onFileSelect?.(file.path)}
                  onShowDiff={() =>
                    onShowDiff?.(file.path, file.originalContent || '', file.content)
                  }
                />
              ))}
          </div>
        </div>
      )}

      {/* Unstaged Changes */}
      <div className="flex-1 overflow-auto">
        <div className="flex items-center justify-between px-3 py-1.5 bg-bolt-elements-background-depth-2 sticky top-0">
          <span className="text-xs font-medium text-bolt-elements-textSecondary">
            Changes ({unstagedCount})
          </span>
          {unstagedCount > 0 && (
            <button
              onClick={stageAll}
              className="text-xs text-bolt-elements-textTertiary hover:text-white"
            >
              Stage All
            </button>
          )}
        </div>
        {changedFiles.filter((f) => !f.staged).length === 0 ? (
          <div className="px-3 py-4 text-center text-bolt-elements-textTertiary text-xs">
            {changedFiles.length === 0 ? (
              <>
                <span className="i-ph:check-circle text-green-500 text-lg block mb-1" />
                No changes
                <button
                  onClick={refreshChanges}
                  className="block mx-auto mt-2 text-blue-400 hover:underline"
                >
                  Check for changes
                </button>
              </>
            ) : (
              'All changes staged'
            )}
          </div>
        ) : (
          changedFiles
            .filter((f) => !f.staged)
            .map((file) => (
              <FileItem
                key={file.path}
                file={file}
                onToggleStage={() => toggleStage(file.path)}
                onSelect={() => onFileSelect?.(file.path)}
                onShowDiff={() =>
                  onShowDiff?.(file.path, file.originalContent || '', file.content)
                }
              />
            ))
        )}
      </div>
    </div>
  );
});

GitPanel.displayName = 'GitPanel';

// File item component
interface FileItemProps {
  file: ChangedFile;
  onToggleStage: () => void;
  onSelect: () => void;
  onShowDiff: () => void;
}

const FileItem = memo(({ file, onToggleStage, onSelect, onShowDiff }: FileItemProps) => {
  const fileName = file.path.split('/').pop() || file.path;
  const dirPath = file.path.substring(0, file.path.lastIndexOf('/')) || '/';

  const statusColors = {
    added: 'text-green-400',
    modified: 'text-yellow-400',
    deleted: 'text-red-400',
  };

  const statusIcons = {
    added: 'i-ph:plus',
    modified: 'i-ph:pencil',
    deleted: 'i-ph:trash',
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1 hover:bg-bolt-elements-background-depth-3 group">
      <button
        onClick={onToggleStage}
        className={classNames(
          'p-0.5 rounded hover:bg-bolt-elements-background-depth-4',
          file.staged ? 'text-green-400' : 'text-bolt-elements-textTertiary'
        )}
        title={file.staged ? 'Unstage' : 'Stage'}
      >
        <span className={file.staged ? 'i-ph:minus' : 'i-ph:plus'} />
      </button>
      <span className={classNames('text-xs', statusColors[file.status])}>
        <span className={statusIcons[file.status]} />
      </span>
      <button
        onClick={onSelect}
        className="flex-1 text-left truncate text-xs text-bolt-elements-textPrimary hover:underline"
        title={file.path}
      >
        {fileName}
        <span className="text-bolt-elements-textTertiary ml-1">{dirPath}</span>
      </button>
      {file.status === 'modified' && (
        <button
          onClick={onShowDiff}
          className="p-0.5 opacity-0 group-hover:opacity-100 text-bolt-elements-textTertiary hover:text-white rounded"
          title="View Diff"
        >
          <span className="i-ph:git-diff" />
        </button>
      )}
    </div>
  );
});

FileItem.displayName = 'FileItem';

// Git config form
interface GitConfigFormProps {
  initialConfig: GitConfig | null;
  onSave: (config: GitConfig) => void;
  onCancel: () => void;
}

const GitConfigForm = memo(({ initialConfig, onSave, onCancel }: GitConfigFormProps) => {
  const [owner, setOwner] = useState(initialConfig?.owner || '');
  const [repo, setRepo] = useState(initialConfig?.repo || '');
  const [branch, setBranch] = useState(initialConfig?.branch || 'main');
  const [accessToken, setAccessToken] = useState(initialConfig?.accessToken || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (owner && repo && accessToken) {
      onSave({ owner, repo, branch, accessToken });
    }
  };

  return (
    <div className="p-4">
      <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-3 flex items-center gap-2">
        <span className="i-ph:git-branch text-purple-400" />
        Connect Repository
      </h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Owner"
            className="px-2 py-1.5 text-xs bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded text-white placeholder:text-gray-500"
          />
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="Repository"
            className="px-2 py-1.5 text-xs bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded text-white placeholder:text-gray-500"
          />
        </div>
        <input
          type="text"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          placeholder="Branch (main)"
          className="w-full px-2 py-1.5 text-xs bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded text-white placeholder:text-gray-500"
        />
        <input
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          placeholder="GitHub Access Token"
          className="w-full px-2 py-1.5 text-xs bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded text-white placeholder:text-gray-500"
        />
        <p className="text-xs text-bolt-elements-textTertiary">
          Get token:{' '}
          <a
            href="https://github.com/settings/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            github.com/settings/tokens
          </a>
        </p>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!owner || !repo || !accessToken}
            className="flex-1 px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-white"
          >
            Connect
          </button>
          {initialConfig && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4 rounded text-bolt-elements-textSecondary"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
});

GitConfigForm.displayName = 'GitConfigForm';

export default GitPanel;
