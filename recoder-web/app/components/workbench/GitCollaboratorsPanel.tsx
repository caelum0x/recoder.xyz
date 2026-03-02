/**
 * GitCollaboratorsPanel — Manage GitHub repository collaborators.
 * List, invite, and remove collaborators. View pending invitations.
 */

import { useState, useCallback } from 'react';
import { useGitCollaborators, type PermissionLevel } from '~/lib/hooks/useGitCollaborators';

export function GitCollaboratorsPanel() {
  const {
    isGitHubRepo,
    repoInfo,
    collaborators,
    invitations,
    isLoading,
    error,
    token,
    setToken,
    clearToken,
    refresh,
    invite,
    remove,
    cancelInvitation,
  } = useGitCollaborators();

  const [tokenInput, setTokenInput] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [invitePermission, setInvitePermission] = useState<PermissionLevel>('push');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const handleConnect = useCallback(() => {
    if (tokenInput.trim()) {
      setToken(tokenInput.trim());
      setTokenInput('');
    }
  }, [tokenInput, setToken]);

  const handleInvite = useCallback(async () => {
    if (!inviteUsername.trim()) return;
    const success = await invite(inviteUsername.trim(), invitePermission);
    if (success) {
      setInviteUsername('');
      setShowInviteForm(false);
    }
  }, [inviteUsername, invitePermission, invite]);

  const handleRemove = useCallback(async (username: string) => {
    await remove(username);
    setConfirmRemove(null);
  }, [remove]);

  // ── Not a GitHub repo ──────────────────────────────────────────

  if (!isGitHubRepo) {
    return (
      <div className="flex flex-col h-full items-center justify-center px-6">
        <div className="i-ph:github-logo text-4xl text-recoder-elements-textTertiary mb-3" />
        <p className="text-sm text-recoder-elements-textSecondary text-center mb-1">
          GitHub Collaborators
        </p>
        <p className="text-xs text-recoder-elements-textTertiary text-center max-w-[220px]">
          Push your project to GitHub to manage collaborators. Add a GitHub remote URL first.
        </p>
      </div>
    );
  }

  // ── No token ──────────────────────────────────────────────────

  if (!token) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-recoder-elements-borderColor">
          <h3 className="text-sm font-medium text-recoder-elements-textPrimary">GitHub Collaborators</h3>
          <p className="text-xs text-recoder-elements-textSecondary mt-0.5">
            {repoInfo?.owner}/{repoInfo?.repo}
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-sm space-y-4">
            <div className="text-center">
              <div className="i-ph:key text-3xl text-recoder-elements-textTertiary mb-2 mx-auto" />
              <p className="text-sm text-recoder-elements-textSecondary">Enter your GitHub token</p>
              <p className="text-xs text-recoder-elements-textTertiary mt-1">
                Needs <code className="bg-recoder-elements-background-depth-3 px-1 rounded">repo</code> scope
              </p>
            </div>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              placeholder="ghp_xxxx..."
              className="w-full px-3 py-2 text-sm bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor rounded-md text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleConnect}
              disabled={!tokenInput.trim()}
              className="w-full px-4 py-2 text-xs bg-recoder-elements-textPrimary text-recoder-elements-background-depth-1 rounded-md hover:opacity-90 disabled:opacity-50 transition-colors"
            >
              Connect
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Connected ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-recoder-elements-borderColor">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-recoder-elements-textPrimary">GitHub Collaborators</h3>
            <p className="text-xs text-recoder-elements-textSecondary mt-0.5">
              {repoInfo?.owner}/{repoInfo?.repo}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="text-xs text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary transition-colors"
              title="Refresh"
            >
              <div className="i-ph:arrows-clockwise text-sm" />
            </button>
            <button
              onClick={clearToken}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 text-xs text-red-400 bg-red-500/10">
          {error}
        </div>
      )}

      {/* Invite form */}
      <div className="px-4 py-2 border-b border-recoder-elements-borderColor">
        {showInviteForm ? (
          <div className="space-y-2">
            <input
              type="text"
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              placeholder="GitHub username"
              autoFocus
              className="w-full px-3 py-1.5 text-sm bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor rounded-md text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:outline-none focus:border-blue-500"
            />
            <div className="flex items-center gap-2">
              <select
                value={invitePermission}
                onChange={(e) => setInvitePermission(e.target.value as PermissionLevel)}
                className="flex-1 px-2 py-1.5 text-xs bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor rounded text-recoder-elements-textPrimary"
              >
                <option value="pull">Read</option>
                <option value="triage">Triage</option>
                <option value="push">Write</option>
                <option value="maintain">Maintain</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={handleInvite}
                disabled={!inviteUsername.trim() || isLoading}
                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-md hover:bg-green-500 disabled:opacity-50 transition-colors"
              >
                Invite
              </button>
              <button
                onClick={() => { setShowInviteForm(false); setInviteUsername(''); }}
                className="px-3 py-1.5 text-xs text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary border border-recoder-elements-borderColor rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowInviteForm(true)}
            className="w-full px-3 py-1.5 text-xs text-blue-400 border border-blue-500/30 rounded-md hover:bg-blue-500/10 transition-colors flex items-center justify-center gap-1.5"
          >
            <div className="i-ph:user-plus text-sm" />
            Invite Collaborator
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="i-ph:spinner-gap animate-spin text-xl text-recoder-elements-textTertiary" />
          </div>
        ) : (
          <>
            {/* Collaborators list */}
            <div className="divide-y divide-recoder-elements-borderColor">
              {collaborators.map((c) => (
                <div key={c.id} className="px-4 py-2.5 flex items-center gap-3">
                  <img
                    src={c.avatarUrl}
                    alt={c.login}
                    className="w-7 h-7 rounded-full"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-recoder-elements-textPrimary truncate">{c.login}</p>
                  </div>
                  <RoleBadge role={c.role} />
                  {c.role !== 'admin' && (
                    confirmRemove === c.login ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleRemove(c.login)}
                          className="px-2 py-0.5 text-[10px] text-red-400 border border-red-500/30 rounded hover:bg-red-500/10 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmRemove(null)}
                          className="px-2 py-0.5 text-[10px] text-recoder-elements-textTertiary border border-recoder-elements-borderColor rounded hover:bg-recoder-elements-background-depth-3 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRemove(c.login)}
                        className="text-recoder-elements-textTertiary hover:text-red-400 transition-colors"
                        title="Remove"
                      >
                        <div className="i-ph:x text-sm" />
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>

            {/* Pending invitations */}
            {invitations.length > 0 && (
              <>
                <div className="px-4 py-2 border-t border-recoder-elements-borderColor">
                  <span className="text-[10px] text-recoder-elements-textSecondary font-medium uppercase tracking-wider">
                    Pending Invitations
                  </span>
                </div>
                <div className="divide-y divide-recoder-elements-borderColor/50">
                  {invitations.map((inv) => (
                    <div key={inv.id} className="px-4 py-2.5 flex items-center gap-3">
                      {inv.avatarUrl ? (
                        <img src={inv.avatarUrl} alt={inv.login} className="w-7 h-7 rounded-full" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-recoder-elements-background-depth-3 flex items-center justify-center">
                          <div className="i-ph:user text-sm text-recoder-elements-textTertiary" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-recoder-elements-textSecondary truncate">
                          {inv.login || 'Unknown'}
                        </p>
                        <p className="text-[10px] text-recoder-elements-textTertiary">
                          Invited {formatDate(inv.createdAt)}
                        </p>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">
                        pending
                      </span>
                      <button
                        onClick={() => cancelInvitation(inv.id)}
                        className="text-recoder-elements-textTertiary hover:text-red-400 transition-colors"
                        title="Cancel invitation"
                      >
                        <div className="i-ph:x text-sm" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {collaborators.length === 0 && invitations.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs text-recoder-elements-textTertiary">No collaborators yet.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    admin: { bg: 'bg-red-500/20', text: 'text-red-400' },
    maintain: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
    write: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    push: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    triage: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
    read: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
    pull: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
  };
  const { bg, text } = config[role] || config.read;
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${bg} ${text}`}>
      {role}
    </span>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return d.toLocaleDateString();
  } catch {
    return dateStr;
  }
}
