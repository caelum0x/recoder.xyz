/**
 * GitBranchList - Branch selector dropdown with create/switch/delete
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';

export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
  lastCommit?: string;
  lastCommitDate?: string;
}

interface GitBranchListProps {
  branches: GitBranch[];
  currentBranch: string;
  isLoading: boolean;
  onCheckout: (branch: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onDelete: (name: string, force?: boolean) => Promise<void>;
  onRefresh: () => void;
}

export const GitBranchList = memo(({
  branches,
  currentBranch,
  isLoading,
  onCheckout,
  onCreate,
  onDelete,
  onRefresh,
}: GitBranchListProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter out duplicates (local vs remote)
  const localBranches = branches.filter(b => !b.remote);
  const remoteBranches = branches.filter(b => b.remote);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowCreateForm(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when create form is shown
  useEffect(() => {
    if (showCreateForm) {
      inputRef.current?.focus();
    }
  }, [showCreateForm]);

  const handleCheckout = useCallback(async (branch: string) => {
    if (branch === currentBranch) return;
    setIsOpen(false);
    await onCheckout(branch);
  }, [currentBranch, onCheckout]);

  const handleCreate = useCallback(async () => {
    if (!newBranchName.trim()) return;

    // Sanitize branch name
    const sanitized = newBranchName.trim().replace(/[^a-zA-Z0-9/_-]/g, '-');
    if (!sanitized) {
      toast.error('Invalid branch name');
      return;
    }

    setIsCreating(true);
    try {
      await onCreate(sanitized);
      setNewBranchName('');
      setShowCreateForm(false);
      setIsOpen(false);
    } finally {
      setIsCreating(false);
    }
  }, [newBranchName, onCreate]);

  const handleDelete = useCallback(async (branch: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (branch === currentBranch) {
      toast.error("Can't delete current branch");
      return;
    }
    if (!confirm(`Delete branch "${branch}"?`)) return;
    await onDelete(branch);
  }, [currentBranch, onDelete]);

  return (
    <div ref={dropdownRef} className="relative">
      {/* Branch Selector Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={classNames(
          'flex items-center gap-2 px-3 py-1.5 text-sm rounded transition-colors w-full',
          'bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3',
          'border border-bolt-elements-borderColor'
        )}
      >
        <span className="i-ph:git-branch text-purple-400" />
        <span className="flex-1 text-left truncate text-bolt-elements-textPrimary">
          {currentBranch || 'main'}
        </span>
        <span className={classNames(
          'i-ph:caret-down transition-transform',
          isOpen ? 'rotate-180' : ''
        )} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg shadow-lg overflow-hidden">
          {/* Create Branch Form */}
          {showCreateForm ? (
            <div className="p-2 border-b border-bolt-elements-borderColor">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="New branch name"
                  className="flex-1 px-2 py-1 text-xs bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded focus:border-blue-500 focus:outline-none text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                    if (e.key === 'Escape') setShowCreateForm(false);
                  }}
                />
                <button
                  onClick={handleCreate}
                  disabled={isCreating || !newBranchName.trim()}
                  className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded text-white"
                >
                  {isCreating ? <span className="i-ph:spinner animate-spin" /> : 'Create'}
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-2 py-1 text-xs bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-3 rounded text-bolt-elements-textSecondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="p-1 border-b border-bolt-elements-borderColor">
              <button
                onClick={() => setShowCreateForm(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded hover:bg-bolt-elements-background-depth-3 text-purple-400"
              >
                <span className="i-ph:plus" />
                Create new branch
              </button>
            </div>
          )}

          {/* Branch List */}
          <div className="max-h-64 overflow-auto">
            {/* Local Branches */}
            {localBranches.length > 0 && (
              <>
                <div className="px-2 py-1 text-xs text-bolt-elements-textTertiary bg-bolt-elements-background-depth-1">
                  Local branches
                </div>
                {localBranches.map((branch) => (
                  <BranchItem
                    key={branch.name}
                    branch={branch}
                    isCurrent={branch.name === currentBranch}
                    onCheckout={() => handleCheckout(branch.name)}
                    onDelete={(e) => handleDelete(branch.name, e)}
                  />
                ))}
              </>
            )}

            {/* Remote Branches */}
            {remoteBranches.length > 0 && (
              <>
                <div className="px-2 py-1 text-xs text-bolt-elements-textTertiary bg-bolt-elements-background-depth-1">
                  Remote branches
                </div>
                {remoteBranches.map((branch) => (
                  <BranchItem
                    key={`remote-${branch.name}`}
                    branch={branch}
                    isCurrent={false}
                    onCheckout={() => handleCheckout(branch.name)}
                  />
                ))}
              </>
            )}

            {localBranches.length === 0 && remoteBranches.length === 0 && (
              <div className="p-4 text-center text-bolt-elements-textTertiary text-xs">
                No branches found
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-1 border-t border-bolt-elements-borderColor">
            <button
              onClick={() => {
                onRefresh();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary"
            >
              <span className="i-ph:arrows-clockwise" />
              Refresh branches
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

GitBranchList.displayName = 'GitBranchList';

// Branch item component
interface BranchItemProps {
  branch: GitBranch;
  isCurrent: boolean;
  onCheckout: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}

const BranchItem = memo(({ branch, isCurrent, onCheckout, onDelete }: BranchItemProps) => {
  return (
    <div
      onClick={onCheckout}
      className={classNames(
        'flex items-center gap-2 px-2 py-1.5 cursor-pointer group',
        isCurrent
          ? 'bg-purple-500/10 text-purple-400'
          : 'hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary'
      )}
    >
      {isCurrent && <span className="i-ph:check text-purple-400" />}
      {branch.remote && <span className="i-ph:cloud text-xs text-bolt-elements-textTertiary" />}
      <span className="flex-1 text-xs truncate">{branch.name}</span>
      {branch.lastCommitDate && (
        <span className="text-xs text-bolt-elements-textTertiary">
          {branch.lastCommitDate}
        </span>
      )}
      {!isCurrent && onDelete && (
        <button
          onClick={onDelete}
          className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded text-red-400"
          title="Delete branch"
        >
          <span className="i-ph:trash text-xs" />
        </button>
      )}
    </div>
  );
});

BranchItem.displayName = 'BranchItem';

export default GitBranchList;
