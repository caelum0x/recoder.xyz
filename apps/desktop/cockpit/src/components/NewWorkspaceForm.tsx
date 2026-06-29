/**
 * NewWorkspaceForm — the "New workspace" creation form.
 *
 * Runtime options come from GET /runtimes (real availability), substrate context
 * from GET /substrates. Submitting POSTs /workspaces with the exact body the
 * handler requires: spaceId, projectId, taskId, repoPath, runtimeId, createdBy,
 * and one of (prompt|command). On success the board refreshes.
 */
import { useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { readConfig } from '../lib/config';
import { chooseFolder, hasFolderPicker } from '../lib/desktop';
import type { CreateWorkspaceBody, WorkspaceSubstrate } from '../types';

interface NewWorkspaceFormProps {
  onCreated: () => void;
  onClose: () => void;
}

function genTaskId(): string {
  return `task_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function NewWorkspaceForm({ onCreated, onClose }: NewWorkspaceFormProps) {
  const defaults = readConfig().defaults || {};
  const runtimes = usePoll(() => api.runtimes(), 15_000);
  const substrates = usePoll(() => api.substrates(), 30_000);

  const [repoPath, setRepoPath] = useState(defaults.repoPath || '');
  const [prompt, setPrompt] = useState('');
  const [runtimeId, setRuntimeId] = useState('');
  const [substrate, setSubstrate] = useState<WorkspaceSubstrate | ''>('');
  const [model, setModel] = useState('');
  const [spaceId, setSpaceId] = useState(defaults.spaceId || 'default');
  const [projectId, setProjectId] = useState(defaults.projectId || 'default');
  const [createdBy, setCreatedBy] = useState(defaults.createdBy || 'cockpit');
  const [baseRef, setBaseRef] = useState('');
  const [pickError, setPickError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const folderPickerAvailable = hasFolderPicker();
  const allRuntimes = runtimes.data || [];
  const availableRuntimes = allRuntimes.filter((r) => r.available);
  const allSubstrates = substrates.data || [];
  const availableSubstrates = allSubstrates.filter((s) => s.available);

  async function pickFolder() {
    setPickError(null);
    try {
      const chosen = await chooseFolder();
      if (chosen) setRepoPath(chosen);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'folder pick failed');
    }
  }

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);

    if (!repoPath.trim() || !prompt.trim() || !runtimeId) {
      setError('Please pick a folder, say what the agent should do, and choose an agent.');
      return;
    }

    const body: CreateWorkspaceBody = {
      spaceId: spaceId.trim() || 'default',
      projectId: projectId.trim() || 'default',
      taskId: genTaskId(),
      repoPath: repoPath.trim(),
      runtimeId,
      createdBy: createdBy.trim() || 'cockpit',
      prompt: prompt.trim(),
    };
    if (substrate) body.substrate = substrate;
    if (model.trim()) body.model = model.trim();
    if (baseRef.trim()) body.baseRef = baseRef.trim();

    setSubmitting(true);
    try {
      await api.createWorkspace(body);
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof BackendUnreachableError) {
        setError(`Can't reach the backend: ${err.message}`);
      } else if (err instanceof ApiError) {
        setError(`Couldn't start the workspace (${err.status}): ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : "couldn't start the workspace");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <form class="modal new-workspace" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div class="modal-header">
          <h2>New workspace</h2>
          <button type="button" class="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <label class="field">
          <span>Folder</span>
          <div class="field-with-action">
            <input
              type="text"
              placeholder="/Users/you/project"
              value={repoPath}
              onInput={(e) => setRepoPath((e.target as HTMLInputElement).value)}
              required
            />
            {folderPickerAvailable && (
              <button type="button" class="btn btn-sm btn-ghost" onClick={() => void pickFolder()}>
                Choose folder…
              </button>
            )}
          </div>
          {!folderPickerAvailable && (
            <span class="field-hint">You can pick a folder in the desktop app. Here, type the full path to your project.</span>
          )}
          {pickError && <span class="form-error">{pickError}</span>}
        </label>

        <label class="field">
          <span>What should the agent do?</span>
          <textarea
            rows={4}
            placeholder="Tell the agent what to work on…"
            value={prompt}
            onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
            required
          />
        </label>

        <div class="field-row">
          <label class="field">
            <span>Agent</span>
            <select
              value={runtimeId}
              onChange={(e) => setRuntimeId((e.target as HTMLSelectElement).value)}
              required
            >
              <option value="" disabled>
                {runtimes.error ? "can't load agents" : 'choose an agent…'}
              </option>
              {allRuntimes.map((r) => (
                <option key={r.runtimeId} value={r.runtimeId} disabled={!r.available}>
                  {r.runtimeId}
                  {r.available
                    ? r.path
                      ? ` — ${r.path}`
                      : ''
                    : ` (${r.bin} not installed)`}
                </option>
              ))}
            </select>
            {runtimeId && (() => {
              const sel = allRuntimes.find((r) => r.runtimeId === runtimeId);
              return sel?.path ? <span class="field-hint">Binary: {sel.path}</span> : null;
            })()}
          </label>

          <label class="field">
            <span>Model (optional)</span>
            <input
              type="text"
              placeholder="default"
              value={model}
              onInput={(e) => setModel((e.target as HTMLInputElement).value)}
            />
          </label>
        </div>

        <div class="field-row">
          <label class="field">
            <span>Substrate</span>
            <select
              value={substrate}
              onChange={(e) => setSubstrate((e.target as HTMLSelectElement).value as WorkspaceSubstrate | '')}
            >
              <option value="">
                {substrates.error ? 'substrates unavailable — default (tmux_worktree)' : 'default (first available)'}
              </option>
              {allSubstrates.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.available}>
                  {s.id}
                  {s.available ? '' : ` (unavailable${s.reason ? `: ${s.reason}` : ''})`}
                </option>
              ))}
            </select>
            {substrates.error && (
              <span class="field-hint">Substrate list unavailable: {substrates.error.message}</span>
            )}
            {!substrates.error && availableSubstrates.length === 0 && substrates.data && (
              <span class="field-hint">No substrates report available — the backend will reject the launch.</span>
            )}
          </label>
        </div>

        <div class="field-row">
          <label class="field">
            <span>Space ID</span>
            <input type="text" value={spaceId} onInput={(e) => setSpaceId((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span>Project ID</span>
            <input type="text" value={projectId} onInput={(e) => setProjectId((e.target as HTMLInputElement).value)} />
          </label>
        </div>

        <div class="field-row">
          <label class="field">
            <span>Created by</span>
            <input type="text" value={createdBy} onInput={(e) => setCreatedBy((e.target as HTMLInputElement).value)} />
          </label>
          <label class="field">
            <span>Base ref (optional)</span>
            <input
              type="text"
              placeholder="main"
              value={baseRef}
              onInput={(e) => setBaseRef((e.target as HTMLInputElement).value)}
            />
          </label>
        </div>

        {runtimes.error && (
          <p class="form-warn">Couldn't load the list of agents: {runtimes.error.message}</p>
        )}
        {!runtimes.error && availableRuntimes.length === 0 && runtimes.data && (
          <p class="form-warn">No agents are set up yet. Install one (like claude or codex) to start work.</p>
        )}
        {error && <p class="form-error">{error}</p>}

        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {submitting ? 'Starting…' : 'Start'}
          </button>
        </div>
      </form>
    </div>
  );
}
