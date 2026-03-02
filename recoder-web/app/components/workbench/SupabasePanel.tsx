/**
 * SupabasePanel — Supabase integration panel for the workbench.
 * Three states: Not connected → Connected (pick project) → Linked (manage)
 */

import { useState, useCallback } from 'react';
import { useSupabase, type SupabaseProject } from '~/lib/hooks/useSupabase';

export function SupabasePanel() {
  const {
    isConnected,
    connect,
    disconnect,
    organizations,
    projects,
    branches,
    linkedProject,
    linkProject,
    unlinkProject,
    getSchema,
    deployFunctions,
    isLoading,
    refreshProjects,
    refreshBranches,
  } = useSupabase();

  const [tokenInput, setTokenInput] = useState('');
  const [error, setError] = useState('');
  const [selectedProject, setSelectedProject] = useState<SupabaseProject | null>(null);
  const [schema, setSchema] = useState('');
  const [showSchema, setShowSchema] = useState(false);
  const [deployResult, setDeployResult] = useState<Array<{ name: string; status: string }> | null>(null);

  const handleConnect = useCallback(async () => {
    setError('');
    const success = await connect(tokenInput.trim());
    if (!success) {
      setError('Invalid access token. Please check and try again.');
    } else {
      setTokenInput('');
    }
  }, [connect, tokenInput]);

  const handleLinkProject = useCallback(async () => {
    if (!selectedProject) return;
    const org = organizations.find(o => o.id === selectedProject.organization_id);
    await linkProject(selectedProject.id, org?.slug || '');
  }, [selectedProject, organizations, linkProject]);

  const handleGetSchema = useCallback(async () => {
    try {
      const s = await getSchema();
      setSchema(s);
      setShowSchema(true);
    } catch (err: any) {
      setError(err.message || 'Failed to get schema');
    }
  }, [getSchema]);

  const handleDeploy = useCallback(async () => {
    try {
      const result = await deployFunctions();
      setDeployResult(result);
    } catch (err: any) {
      setError(err.message || 'Deploy failed');
    }
  }, [deployFunctions]);

  // ── Not Connected ─────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="h-full flex flex-col p-4 overflow-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="i-ph:database text-green-500 text-xl" />
          <h3 className="font-semibold text-recoder-elements-textPrimary">Connect Supabase</h3>
        </div>

        <p className="text-sm text-recoder-elements-textSecondary mb-4">
          Connect your Supabase project to enable database schema context for AI, edge function deployment, and more.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-recoder-elements-textSecondary mb-1">
              Personal Access Token
            </label>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              placeholder="sbp_xxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 rounded-lg border border-recoder-elements-borderColor bg-recoder-elements-background-depth-1 text-recoder-elements-textPrimary text-sm focus:outline-none focus:ring-2 focus:ring-green-500/50"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <button
            onClick={handleConnect}
            disabled={!tokenInput.trim() || isLoading}
            className="w-full px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Connecting...' : 'Connect'}
          </button>

          <a
            href="https://supabase.com/dashboard/account/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-xs text-center text-green-500 hover:underline"
          >
            Get your access token from Supabase Dashboard
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
            <div className="i-ph:database text-green-500 text-xl" />
            <h3 className="font-semibold text-recoder-elements-textPrimary">Link Supabase Project</h3>
          </div>
          <button
            onClick={disconnect}
            className="text-xs text-recoder-elements-textSecondary hover:text-red-500"
          >
            Disconnect
          </button>
        </div>

        <p className="text-sm text-recoder-elements-textSecondary mb-3">
          Select a Supabase project to link to this Recoder project.
        </p>

        <div className="space-y-2 flex-1 overflow-auto">
          {projects.map((proj) => (
            <button
              key={proj.id}
              onClick={() => setSelectedProject(proj)}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                selectedProject?.id === proj.id
                  ? 'border-green-500 bg-green-500/10 text-recoder-elements-textPrimary'
                  : 'border-recoder-elements-borderColor hover:border-green-500/50 text-recoder-elements-textSecondary'
              }`}
            >
              <div className="font-medium">{proj.name}</div>
              <div className="text-xs opacity-70">{proj.region} &middot; {proj.status}</div>
            </button>
          ))}

          {projects.length === 0 && (
            <p className="text-xs text-recoder-elements-textSecondary text-center py-4">
              No projects found. Create one in Supabase first.
            </p>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            onClick={refreshProjects}
            className="flex-1 px-3 py-2 rounded-lg border border-recoder-elements-borderColor text-recoder-elements-textSecondary text-sm hover:bg-recoder-elements-background-depth-1"
          >
            Refresh
          </button>
          <button
            onClick={handleLinkProject}
            disabled={!selectedProject || isLoading}
            className="flex-1 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50"
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
          <div className="i-ph:database text-green-500 text-xl" />
          <h3 className="font-semibold text-recoder-elements-textPrimary">Supabase</h3>
          <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-500 text-xs">Connected</span>
        </div>
        <button
          onClick={unlinkProject}
          className="text-xs text-recoder-elements-textSecondary hover:text-red-500"
        >
          Unlink
        </button>
      </div>

      <div className="space-y-3">
        {/* Schema viewer */}
        <button
          onClick={handleGetSchema}
          disabled={isLoading}
          className="w-full px-3 py-2 rounded-lg border border-recoder-elements-borderColor text-recoder-elements-textPrimary text-sm hover:bg-recoder-elements-background-depth-1 flex items-center gap-2"
        >
          <div className="i-ph:table" />
          View Schema
        </button>

        {showSchema && (
          <div className="p-3 rounded-lg bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor max-h-64 overflow-auto">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-medium text-recoder-elements-textSecondary">Database Schema</span>
              <button onClick={() => setShowSchema(false)} className="text-xs text-recoder-elements-textSecondary hover:text-recoder-elements-textPrimary">Close</button>
            </div>
            <pre className="text-xs text-recoder-elements-textPrimary whitespace-pre-wrap font-mono">{schema}</pre>
          </div>
        )}

        {/* Deploy edge functions */}
        <button
          onClick={handleDeploy}
          disabled={isLoading}
          className="w-full px-3 py-2 rounded-lg border border-recoder-elements-borderColor text-recoder-elements-textPrimary text-sm hover:bg-recoder-elements-background-depth-1 flex items-center gap-2"
        >
          <div className="i-ph:cloud-arrow-up" />
          Deploy Edge Functions
        </button>

        {deployResult && (
          <div className="p-3 rounded-lg bg-recoder-elements-background-depth-1 border border-recoder-elements-borderColor">
            <span className="text-xs font-medium text-recoder-elements-textSecondary mb-1 block">Deploy Results</span>
            {deployResult.map((r) => (
              <div key={r.name} className="flex items-center gap-2 text-xs py-0.5">
                <span className={r.status === 'deployed' ? 'text-green-500' : 'text-red-500'}>
                  {r.status === 'deployed' ? '\u2713' : '\u2717'}
                </span>
                <span className="text-recoder-elements-textPrimary">{r.name}</span>
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          onClick={disconnect}
          className="w-full px-3 py-2 rounded-lg border border-red-500/30 text-red-500 text-sm hover:bg-red-500/10"
        >
          Disconnect Supabase
        </button>
      </div>
    </div>
  );
}
