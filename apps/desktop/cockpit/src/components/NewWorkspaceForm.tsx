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
import type { CreateWorkspaceBody } from '../types';

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

  const [repoPath, setRepoPath] = useState(defaults.repoPath || '');
  const [prompt, setPrompt] = useState('');
  const [runtimeId, setRuntimeId] = useState('');
  const [model, setModel] = useState('');
  const [spaceId, setSpaceId] = useState(defaults.spaceId || 'default');
  const [projectId, setProjectId] = useState(defaults.projectId || 'default');
  const [createdBy, setCreatedBy] = useState(defaults.createdBy || 'cockpit');
  const [baseRef, setBaseRef] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableRuntimes = (runtimes.data || []).filter((r) => r.available);
  const allRuntimes = runtimes.data || [];

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);

    if (!repoPath.trim() || !prompt.trim() || !runtimeId) {
      setError('Repo path, prompt, and runtime are required.');
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
    if (model.trim()) body.model = model.trim();
    if (baseRef.trim()) body.baseRef = baseRef.trim();

    setSubmitting(true);
    try {
      await api.createWorkspace(body);
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof BackendUnreachableError) {
        setError(`Backend unreachable: ${err.message}`);
      } else if (err instanceof ApiError) {
        setError(`Backend rejected create (${err.status}): ${err.message}`);
      } else {
        setError(err instanceof Error ? err.message : 'create failed');
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
          <span>Repo path</span>
          <input
            type="text"
            placeholder="/Users/you/project"
            value={repoPath}
            onInput={(e) => setRepoPath((e.target as HTMLInputElement).value)}
            required
          />
        </label>

        <label class="field">
          <span>Prompt</span>
          <textarea
            rows={4}
            placeholder="Describe the task for the agent…"
            value={prompt}
            onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
            required
          />
        </label>

        <div class="field-row">
          <label class="field">
            <span>Runtime</span>
            <select
              value={runtimeId}
              onChange={(e) => setRuntimeId((e.target as HTMLSelectElement).value)}
              required
            >
              <option value="" disabled>
                {runtimes.error ? 'runtimes unavailable' : 'select runtime…'}
              </option>
              {allRuntimes.map((r) => (
                <option key={r.runtimeId} value={r.runtimeId} disabled={!r.available}>
                  {r.runtimeId}{r.available ? '' : ' (not installed)'}
                </option>
              ))}
            </select>
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
          <p class="form-warn">Runtime list unavailable: {runtimes.error.message}</p>
        )}
        {!runtimes.error && availableRuntimes.length === 0 && runtimes.data && (
          <p class="form-warn">No agent CLIs are installed on the backend host. Install one (e.g. claude, codex) to run work.</p>
        )}
        {error && <p class="form-error">{error}</p>}

        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" class="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create workspace'}
          </button>
        </div>
      </form>
    </div>
  );
}
