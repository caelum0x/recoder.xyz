/**
 * NeonPanel — Neon PostgreSQL integration panel for the workbench.
 * Three states: Not connected → Connected (pick/create project) → Linked (manage branches)
 */

import { useState, useCallback } from 'react';
import { useNeon, type NeonProject, type NeonBranch } from '~/lib/hooks/useNeon';

export function NeonPanel() {
  const {
    isConnected,
    connect,
    disconnect,
    projects,
    branches,
    linkedProject,
    createProject,
    linkProject,
    unlinkProject,
    setContainerEnv,
    createBranch,
    deleteBranch,
    isLoading,
    refreshProjects,
    refreshBranches,
  } = useNeon();

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [error, setError] = useState('');
  const [selectedProject, setSelectedProject] = useState<NeonProject | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [showCreateBranch, setShowCreateBranch] = useState(false);

  const handleConnect = useCallback(async () => {
    setError('');
    const success = await connect(apiKeyInput.trim());
    if (!success) {
      setError('Invalid API key. Please check and try again.');
    } else {
      setApiKeyInput('');
    }
  }, [connect, apiKeyInput]);

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) return;
    setError('');
    try {
      const result = await createProject(newProjectName.trim());
      setNewProjectName('');
      setShowCreateProject(false);
      // Auto-select and link the new project
      setSelectedProject(result.project);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    }
  }, [createProject, newProjectName]);

  const handleLinkProject = useCallback(async () => {
    if (!selectedProject) return;
    // Find the default branch
    const defaultBranch = branches.find(b => b.default) || branches[0];
    await linkProject(selectedProject.id, defaultBranch?.id || '', undefined);
  }, [selectedProject, branches, linkProject]);

  const handleSetActive = useCallback(async (branch: NeonBranch) => {
    try {
      await setContainerEnv(branch.id);
    } catch (err: any) {
      setError(err.message || 'Failed to set environment');
    }
  }, [setContainerEnv]);

  const handleCreateBranch = useCallback(async () => {
    if (!newBranchName.trim()) return;
    const parentBranch = branches.find(b => b.default) || branches[0];
    if (!parentBranch) return;
    try {
      await createBranch(newBranchName.trim(), parentBranch.id);
      setNewBranchName('');
      setShowCreateBranch(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create branch');
    }
  }, [createBranch, newBranchName, branches]);

  const getBranchBadgeColor = (branch: NeonBranch): string => {
    if (branch.default) return 'bg-green-500/20 text-green-500';
    if (branch.name === 'preview') return 'bg-yellow-500/20 text-yellow-500';
    return 'bg-blue-500/20 text-blue-500';
  };

  const getBranchLabel = (branch: NeonBranch): string => {
    if (branch.default) return 'production';
    if (branch.name === 'preview') return 'preview';
    return 'development';
  };

  // ── Not Connected ─────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="h-full flex flex-col p-4 overflow-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:database text-blue-500 text-xl" />
          <h3 className="font-semibold text-recoder-elements-textPrimary">Connect Neon PostgreSQL</h3>
        </div>

        <p className="text-sm text-recoder-elements-textSecondary mb-4">
          Connect your Neon database to automatically set POSTGRES_URL in your container and manage branches.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-recoder-elements-textSecondary mb-1">API Key</label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              placeholder="neon_xxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            onClick={handleConnect}
            disabled={!apiKeyInput.trim() || isLoading}
            className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Connecting...' : 'Connect'}
          </button>

          <a
            href="https://console.neon.tech/app/settings/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs text-center text-blue-500 hover:underline"
          >
            Get your API key from Neon Console
          </a>
        </div>
      </div>
    );
  }

  // ── Connected, no project linked ──────────────────────────────
  if (!linkedProject) {
    return (
      <div className="h-full flex flex-col p-4 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="i-ph:database text-blue-500 text-xl" />
            <h3 className="font-semibold text-recoder-elements-textPrimary">Link Neon Project</h3>
          </div>
          <button
            onClick={disconnect}
            className="text-xs text-recoder-elements-textSecondary hover:text-red-500"
          >
            Disconnect
          </button>
        </div>

        {showCreateProject ? (
          <div className="space-y-2 mb-3">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
              placeholder="Project name"
              className="w-full px-3 py-2 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreateProject(false)}
                className="flex-1 px-3 py-1.5 rounded-lg border border-recoder-elements-borderColor text-recoder-elements-textSecondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim() || isLoading}
                className="flex-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
              >
                {isLoading ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCreateProject(true)}
            className="w-full px-3 py-2 mb-3 rounded-lg border border-dashed border-blue-500/50 text-blue-500 text-sm hover:bg-blue-500/10"
          >
            + Create New Project
          </button>
        )}

        <div className="space-y-2 flex-1 overflow-auto">
          {projects.map((proj) => (
            <button
              key={proj.id}
              onClick={() => setSelectedProject(proj)}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                selectedProject?.id === proj.id
                  ? 'border-blue-500 bg-blue-500/10 text-recoder-elements-textPrimary'
                  : 'border-recoder-elements-borderColor hover:border-blue-500/50 text-recoder-elements-textSecondary'
              }`}
            >
              <div className="font-medium">{proj.name}</div>
              <div className="text-xs opacity-70">{proj.region_id}</div>
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

        <div className="mt-3 flex gap-2">
          <button
            onClick={refreshProjects}
            className="flex-1 px-3 py-2 rounded-lg border border-recoder-elements-borderColor text-recoder-elements-textSecondary text-sm"
          >
            Refresh
          </button>
          <button
            onClick={handleLinkProject}
            disabled={!selectedProject || isLoading}
            className="flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
          >
            Link Project
          </button>
        </div>
      </div>
    );
  }

  // ── Connected + Linked ────────────────────────────────────────
  return (
    <div className="h-full flex flex-col p-4 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="i-ph:database text-blue-500 text-xl" />
          <h3 className="font-semibold text-recoder-elements-textPrimary">Neon PostgreSQL</h3>
          <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-500 text-xs">Connected</span>
        </div>
        <button
          onClick={unlinkProject}
          className="text-xs text-recoder-elements-textSecondary hover:text-red-500"
        >
          Unlink
        </button>
      </div>

      {/* Branch list */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-recoder-elements-textSecondary">Branches</span>
          <button
            onClick={() => setShowCreateBranch(!showCreateBranch)}
            className="text-xs text-blue-500 hover:underline"
          >
            + New Branch
          </button>
        </div>

        {showCreateBranch && (
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
              placeholder="Branch name"
              className="flex-1 px-2 py-1.5 rounded border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary text-xs"
            />
            <button
              onClick={handleCreateBranch}
              disabled={!newBranchName.trim() || isLoading}
              className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs disabled:opacity-50"
            >
              Create
            </button>
          </div>
        )}

        <div className="space-y-1.5">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className="flex items-center justify-between px-3 py-2 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-recoder-elements-textPrimary">{branch.name}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${getBranchBadgeColor(branch)}`}>
                  {getBranchLabel(branch)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleSetActive(branch)}
                  className="px-2 py-1 rounded text-xs text-blue-500 hover:bg-blue-500/10"
                  title="Set as active (update POSTGRES_URL)"
                >
                  Use
                </button>
                {!branch.default && (
                  <button
                    onClick={() => deleteBranch(branch.id)}
                    className="px-2 py-1 rounded text-xs text-red-500 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}

          {branches.length === 0 && (
            <p className="text-xs text-recoder-elements-textSecondary text-center py-3">
              No branches found.
              <button onClick={refreshBranches} className="text-blue-500 ml-1 hover:underline">
                Refresh
              </button>
            </p>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      <div className="mt-auto">
        <button
          onClick={disconnect}
          className="w-full px-3 py-2 rounded-lg border border-red-500/30 text-red-500 text-sm hover:bg-red-500/10"
        >
          Disconnect Neon
        </button>
      </div>
    </div>
  );
}
