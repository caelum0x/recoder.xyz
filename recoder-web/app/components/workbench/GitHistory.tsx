/**
 * GitHistory - Visual commit history with graph
 */

import { memo, useState, useCallback } from 'react';
import { classNames } from '~/utils/classNames';

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  timestamp: number;
}

interface GitHistoryProps {
  commits: GitCommit[];
  isLoading: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
}

export const GitHistory = memo(({ commits, isLoading, onLoadMore, hasMore }: GitHistoryProps) => {
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);

  const handleCopyHash = useCallback((hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hash);
  }, []);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'today';
    } else if (diffDays === 1) {
      return 'yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} month${months > 1 ? 's' : ''} ago`;
    } else {
      const years = Math.floor(diffDays / 365);
      return `${years} year${years > 1 ? 's' : ''} ago`;
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarColor = (email: string) => {
    // Simple hash to get consistent color for email
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      'bg-purple-500',
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-red-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-cyan-500',
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  if (isLoading && commits.length === 0) {
    return (
      <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500 mx-auto mb-2" />
        Loading history...
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="p-4 text-center text-bolt-elements-textTertiary text-sm">
        <span className="i-ph:git-commit text-2xl block mb-2" />
        No commits yet
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        {commits.map((commit, index) => (
          <div
            key={commit.hash}
            className={classNames(
              'relative flex gap-3 px-3 py-2 cursor-pointer transition-colors',
              expandedCommit === commit.hash
                ? 'bg-purple-500/10'
                : 'hover:bg-bolt-elements-background-depth-2'
            )}
            onClick={() => setExpandedCommit(expandedCommit === commit.hash ? null : commit.hash)}
          >
            {/* Graph line */}
            <div className="flex flex-col items-center w-4 shrink-0">
              <div
                className={classNames(
                  'w-0.5 flex-1',
                  index === 0 ? '' : 'bg-purple-500/30'
                )}
              />
              <div className="w-3 h-3 rounded-full bg-purple-500 border-2 border-bolt-elements-background-depth-1 z-10" />
              <div
                className={classNames(
                  'w-0.5 flex-1',
                  index === commits.length - 1 ? '' : 'bg-purple-500/30'
                )}
              />
            </div>

            {/* Commit content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2">
                {/* Avatar */}
                <div
                  className={classNames(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs text-white shrink-0',
                    getAvatarColor(commit.authorEmail)
                  )}
                  title={commit.author}
                >
                  {getInitials(commit.author)}
                </div>

                {/* Message */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-bolt-elements-textPrimary truncate">
                    {commit.message}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-bolt-elements-textTertiary">
                    <span>{commit.author}</span>
                    <span>•</span>
                    <span>{formatDate(commit.timestamp)}</span>
                  </div>
                </div>

                {/* Hash */}
                <button
                  onClick={(e) => handleCopyHash(commit.hash, e)}
                  className="shrink-0 px-1.5 py-0.5 text-xs font-mono bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4 rounded text-bolt-elements-textTertiary"
                  title="Copy full hash"
                >
                  {commit.shortHash}
                </button>
              </div>

              {/* Expanded details */}
              {expandedCommit === commit.hash && (
                <div className="mt-2 ml-8 p-2 bg-bolt-elements-background-depth-3 rounded text-xs">
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <span className="text-bolt-elements-textTertiary">Hash:</span>
                    <span className="font-mono text-bolt-elements-textSecondary">{commit.hash}</span>
                    <span className="text-bolt-elements-textTertiary">Author:</span>
                    <span className="text-bolt-elements-textSecondary">{commit.author} &lt;{commit.authorEmail}&gt;</span>
                    <span className="text-bolt-elements-textTertiary">Date:</span>
                    <span className="text-bolt-elements-textSecondary">{commit.date}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Load more */}
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="w-full py-2 text-xs text-center text-bolt-elements-textTertiary hover:bg-bolt-elements-background-depth-2"
          >
            {isLoading ? (
              <span className="i-ph:spinner animate-spin" />
            ) : (
              'Load more commits'
            )}
          </button>
        )}
      </div>
    </div>
  );
});

GitHistory.displayName = 'GitHistory';

export default GitHistory;
