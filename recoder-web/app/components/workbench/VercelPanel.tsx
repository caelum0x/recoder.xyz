/**
 * VercelPanel — Vercel integration panel.
 * Connect Vercel account, link projects, deploy, and view deployment history.
 */

import { useState, useCallback, useEffect } from 'react';
import { useVercel, type VercelProject } from '~/lib/hooks/useVercel';

export function VercelPanel() {
  const {
    isConnected,
    username,
    teams,
    selectedTeamId,
    setSelectedTeamId,
    projects,
    linkedProject,
    deployments,
    isLoading,
    isDeploying,
    connect,
    disconnect,
    loadProjects,
    linkProject,
    unlinkProject,
    createProject,
    deploy,
    loadDeployments,
    detectFramework,
  } = useVercel();

  const [tokenInput, setTokenInput] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [buildDir, setBuildDir] = useState('dist');
  const [detectedFramework, setDetectedFramework] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load projects when connected and team changes
  useEffect(() => {
    if (isConnected) {
      loadProjects(selectedTeamId);
    }
  }, [isConnected, selectedTeamId]);

  const handleConnect = useCallback(async () => {
    setError(null);
    const success = await connect(tokenInput);
    if (success) {
      setTokenInput('');
    } else {
      setError('Invalid access token. Please check and try again.');
    }
  }, [connect, tokenInput]);

  const handleLinkProject = useCallback(async (project: VercelProject) => {
    await linkProject(project.id, project.name, selectedTeamId);
  }, [linkProject, selectedTeamId]);

  const handleCreateAndLink = useCallback(async () => {
    if (!newProjectName.trim()) return;
    setError(null);
    const project = await createProject(newProjectName, detectedFramework || undefined);
    if (project) {
      await linkProject(project.id, project.name, selectedTeamId);
      setNewProjectName('');
      setShowCreateProject(false);
    } else {
      setError('Failed to create project. The name might be taken.');
    }
  }, [newProjectName, detectedFramework, createProject, linkProject, selectedTeamId]);

  const handleDeploy = useCallback(async () => {
    setError(null);
    const result = await deploy({ buildDir });
    if (!result) {
      setError('Deployment failed. Make sure you have a build output directory.');
    }
  }, [deploy, buildDir]);

  const handleDetectFramework = useCallback(async () => {
    const fw = await detectFramework();
    setDetectedFramework(fw);
    // Set build dir based on framework
    if (fw === 'nextjs') setBuildDir('.next');
    else if (fw === 'nuxtjs') setBuildDir('.nuxt');
    else if (fw === 'astro') setBuildDir('dist');
    else setBuildDir('dist');
  }, [detectFramework]);

  // ── Not Connected ──────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-recoder-elements-borderColor">
          <h3 className="text-sm font-medium text-recoder-elements-textPrimary">Vercel</h3>
          <p className="text-xs text-recoder-elements-textSecondary mt-0.5">
            Deploy your project to Vercel with one click.
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="w-full max-w-sm space-y-4">
            <div className="text-center">
              <div className="i-ph:rocket-launch text-4xl text-recoder-elements-textTertiary mb-2 mx-auto" />
              <p className="text-sm text-recoder-elements-textSecondary">Connect your Vercel account</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-recoder-elements-textSecondary mb-1">
                Access Token
              </label>
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                placeholder="Enter your Vercel access token"
                className="w-full px-3 py-2 text-sm bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor rounded-md text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:outline-none focus:border-blue-500"
              />
            </div>
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
            <button
              onClick={handleConnect}
              disabled={!tokenInput.trim() || isLoading}
              className="w-full px-4 py-2 text-sm bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {isLoading ? 'Connecting...' : 'Connect Vercel'}
            </button>
            <p className="text-xs text-recoder-elements-textTertiary text-center">
              Get your token from{' '}
              <a
                href="https://vercel.com/account/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                vercel.com/account/tokens
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Connected, No Project Linked ──────────────────────────────

  if (!linkedProject) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-recoder-elements-borderColor">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-recoder-elements-textPrimary">Vercel</h3>
              <p className="text-xs text-recoder-elements-textSecondary mt-0.5">
                Connected as <span className="text-recoder-elements-textPrimary">{username}</span>
              </p>
            </div>
            <button
              onClick={disconnect}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>

        {/* Team selector */}
        {teams.length > 0 && (
          <div className="px-4 py-2 border-b border-recoder-elements-borderColor">
            <select
              value={selectedTeamId || ''}
              onChange={(e) => setSelectedTeamId(e.target.value || null)}
              className="w-full px-2 py-1.5 text-xs bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor rounded text-recoder-elements-textPrimary"
            >
              <option value="">Personal Account</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Project list or create */}
        <div className="flex-1 overflow-auto">
          <div className="px-4 py-2 flex items-center justify-between border-b border-recoder-elements-borderColor/50">
            <span className="text-xs font-medium text-recoder-elements-textSecondary uppercase tracking-wider">
              Link a Vercel Project
            </span>
            <button
              onClick={() => setShowCreateProject(!showCreateProject)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              {showCreateProject ? 'Cancel' : '+ New'}
            </button>
          </div>

          {showCreateProject && (
            <div className="px-4 py-3 border-b border-recoder-elements-borderColor bg-recoder-elements-background-depth-3">
              <div className="space-y-2">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Project name"
                  className="w-full px-3 py-1.5 text-sm bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor rounded-md text-recoder-elements-textPrimary placeholder:text-recoder-elements-textTertiary focus:outline-none focus:border-blue-500"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCreateAndLink}
                    disabled={!newProjectName.trim() || isLoading}
                    className="px-3 py-1.5 text-xs bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
                  >
                    Create & Link
                  </button>
                  <button
                    onClick={handleDetectFramework}
                    className="px-3 py-1.5 text-xs text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary border border-recoder-elements-borderColor rounded-md transition-colors"
                  >
                    Detect Framework
                  </button>
                  {detectedFramework && (
                    <span className="text-xs text-green-400">{detectedFramework}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="px-4 py-2 text-xs text-red-400 bg-red-500/10">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="i-ph:spinner-gap animate-spin text-xl text-recoder-elements-textTertiary" />
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-xs text-recoder-elements-textTertiary">No projects found.</p>
            </div>
          ) : (
            <div className="divide-y divide-recoder-elements-borderColor">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="px-4 py-2.5 flex items-center justify-between hover:bg-recoder-elements-background-depth-3 transition-colors"
                >
                  <div>
                    <p className="text-sm text-recoder-elements-textPrimary">{project.name}</p>
                    {project.framework && (
                      <p className="text-xs text-recoder-elements-textTertiary">{project.framework}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleLinkProject(project)}
                    className="px-2 py-1 text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 rounded hover:border-blue-500/50 transition-colors"
                  >
                    Link
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Connected + Linked ────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-recoder-elements-borderColor">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-recoder-elements-textPrimary">Vercel</h3>
            <p className="text-xs text-recoder-elements-textSecondary mt-0.5">
              Connected as <span className="text-recoder-elements-textPrimary">{username}</span>
            </p>
          </div>
          <button
            onClick={disconnect}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Disconnect
          </button>
        </div>
      </div>

      {/* Linked project info */}
      <div className="px-4 py-3 border-b border-recoder-elements-borderColor bg-recoder-elements-background-depth-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-recoder-elements-textPrimary">
                {linkedProject.vercelProjectName}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">Linked</span>
            </div>
            {linkedProject.vercelDeploymentUrl && (
              <a
                href={`https://${linkedProject.vercelDeploymentUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline mt-0.5 block truncate max-w-[250px]"
              >
                {linkedProject.vercelDeploymentUrl}
              </a>
            )}
          </div>
          <button
            onClick={unlinkProject}
            className="text-xs text-recoder-elements-textTertiary hover:text-red-400 transition-colors"
          >
            Unlink
          </button>
        </div>
      </div>

      {/* Deploy section */}
      <div className="px-4 py-3 border-b border-recoder-elements-borderColor">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="block text-xs text-recoder-elements-textSecondary mb-1">Build directory</label>
            <input
              type="text"
              value={buildDir}
              onChange={(e) => setBuildDir(e.target.value)}
              className="w-full px-2 py-1 text-xs bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor rounded text-recoder-elements-textPrimary focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleDeploy}
            disabled={isDeploying}
            className="mt-4 px-4 py-1.5 text-xs bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {isDeploying ? (
              <>
                <div className="i-ph:spinner-gap animate-spin text-sm" />
                Deploying...
              </>
            ) : (
              <>
                <div className="i-ph:rocket-launch text-sm" />
                Deploy
              </>
            )}
          </button>
        </div>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>

      {/* Deployments list */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-2 flex items-center justify-between border-b border-recoder-elements-borderColor/50">
          <span className="text-xs font-medium text-recoder-elements-textSecondary uppercase tracking-wider">
            Recent Deployments
          </span>
          <button
            onClick={loadDeployments}
            className="text-xs text-recoder-elements-textTertiary hover:text-recoder-elements-textPrimary transition-colors"
            title="Refresh"
          >
            <div className="i-ph:arrows-clockwise text-sm" />
          </button>
        </div>
        {deployments.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-recoder-elements-textTertiary">No deployments yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-recoder-elements-borderColor">
            {deployments.map((d) => (
              <div key={d.uid} className="px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DeploymentStatusBadge state={d.readyState || d.state} />
                    <a
                      href={`https://${d.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline truncate max-w-[200px]"
                    >
                      {d.url}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.target && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        d.target === 'production' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {d.target}
                      </span>
                    )}
                    <span className="text-[10px] text-recoder-elements-textTertiary">
                      {formatTime(d.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeploymentStatusBadge({ state }: { state: string }) {
  const colors: Record<string, string> = {
    READY: 'bg-green-500',
    BUILDING: 'bg-yellow-500 animate-pulse',
    QUEUED: 'bg-gray-400',
    ERROR: 'bg-red-500',
    CANCELED: 'bg-gray-500',
  };
  return (
    <div className={`w-2 h-2 rounded-full ${colors[state] || 'bg-gray-400'}`} title={state} />
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString();
}
