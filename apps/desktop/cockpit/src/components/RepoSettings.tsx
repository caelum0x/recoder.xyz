/**
 * RepoSettings — the per-repo setup-script pane, tucked behind the avatar
 * settings (NOT a primary tab, per the minimal-chrome design).
 *
 * A "setup script" is the shell the conductor runs ONCE inside every fresh
 * worktree of a repo (install deps, seed env, warm caches) so an agent starts in
 * a ready project instead of a bare checkout. This pane lets the user pick a repo
 * (derived from their live workspaces, keyed the SAME way the backend runs setup)
 * and edit that script.
 *
 * Wires the two governed edges:
 *   Load → GET /repo-setup-script?repoKey=…   (null config ⇒ empty script)
 *   Save → PUT /repo-setup-script             (GOVERNED: a deny is a truthful 403)
 *
 * Truthfulness rules (mirrors CheckpointsPanel / WorkspaceDetail):
 *  - The Save button reflects the real in-flight write; a backend failure shows
 *    the REAL error (a governance deny reads as "blocked by the governance
 *    gate", never a faked success).
 *  - An empty script is a legal value — saving it CLEARS the repo's script, and
 *    the pane says so rather than pretending nothing happened.
 *  - No repos (no workspaces yet) is an explicit truthful empty state.
 */
import { useEffect, useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { reposFromWorkspaces } from '../lib/repo-key';
import type { RepoSetupConfig, Workspace } from '../types';

interface RepoSettingsProps {
  workspaces: ReadonlyArray<Workspace>;
  onClose: () => void;
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; config: RepoSetupConfig | null }
  | { kind: 'error'; message: string };

type SaveOutcome =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved'; cleared: boolean }
  | { kind: 'error'; message: string };

function describeError(err: unknown): string {
  if (err instanceof BackendUnreachableError) return `Backend unreachable: ${err.message}`;
  if (err instanceof ApiError) {
    // A governance deny is a 403 — name it plainly so the user sees WHY, not a
    // bare status. The backend's reason rides on the message.
    if (err.status === 403) return `Blocked by the governance gate: ${err.message}`;
    return `Backend error (${err.status}): ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

export function RepoSettings({ workspaces, onClose }: RepoSettingsProps) {
  const repos = reposFromWorkspaces(workspaces);
  const [repoKey, setRepoKey] = useState<string>(() => repos[0]?.repoKey ?? '');
  const [script, setScript] = useState<string>('');
  const [load, setLoad] = useState<LoadState>({ kind: 'idle' });
  const [save, setSave] = useState<SaveOutcome>({ kind: 'idle' });

  // Load the selected repo's script whenever the selection changes. A null
  // config (no script yet) is a truthful empty textarea, never an error.
  useEffect(() => {
    if (!repoKey) {
      setLoad({ kind: 'idle' });
      return;
    }
    let cancelled = false;
    setLoad({ kind: 'loading' });
    setSave({ kind: 'idle' });
    api
      .repoSetupScript(repoKey)
      .then((config) => {
        if (cancelled) return;
        setLoad({ kind: 'loaded', config });
        setScript(config?.script ?? '');
      })
      .catch((err) => {
        if (cancelled) return;
        setLoad({ kind: 'error', message: describeError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [repoKey]);

  async function onSave(): Promise<void> {
    if (!repoKey) return;
    setSave({ kind: 'saving' });
    try {
      const config = await api.saveRepoSetupScript(repoKey, script);
      const cleared = (config?.script ?? '').trim().length === 0;
      setLoad({ kind: 'loaded', config });
      setSave({ kind: 'saved', cleared });
    } catch (err) {
      setSave({ kind: 'error', message: describeError(err) });
    }
  }

  const saving = save.kind === 'saving';
  const loaded = load.kind === 'loaded' ? load.config : null;

  return (
    <div class="modal-backdrop" onClick={onClose}>
      <div class="modal repo-settings" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Repo setup</h2>
          <button class="icon-btn" onClick={onClose} aria-label="Close settings">
            ×
          </button>
        </div>

        <p class="repo-settings-intro">
          The shell run once inside every fresh worktree of a repo — install deps, seed env, warm
          caches — so agents start in a ready project. Empty means no setup script.
        </p>

        {repos.length === 0 ? (
          <p class="repo-settings-empty">
            No repos yet — start a workspace and its repo will appear here to configure.
          </p>
        ) : (
          <>
            <label class="field">
              <span>Repo</span>
              <select
                value={repoKey}
                onChange={(e) => setRepoKey((e.target as HTMLSelectElement).value)}
                disabled={saving}
              >
                {repos.map((r) => (
                  <option key={r.repoKey} value={r.repoKey}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>

            <label class="field">
              <span>Setup script</span>
              <textarea
                class="repo-settings-script"
                rows={10}
                spellcheck={false}
                placeholder={'e.g.\npnpm install\ncp .env.example .env'}
                value={script}
                disabled={load.kind === 'loading' || saving}
                onInput={(e) => {
                  setScript((e.target as HTMLTextAreaElement).value);
                  if (save.kind !== 'idle') setSave({ kind: 'idle' });
                }}
              />
            </label>

            {load.kind === 'loading' && <p class="repo-settings-note">Loading current script…</p>}
            {load.kind === 'error' && (
              <p class="form-error">Couldn't load the current script — {load.message}</p>
            )}
            {loaded && (
              <p class="repo-settings-meta">
                Last updated {loaded.updatedAt}
                {loaded.updatedBy ? ` by ${loaded.updatedBy}` : ''}.
              </p>
            )}

            {save.kind === 'saved' && (
              <p class="form-note">
                {save.cleared ? 'Setup script cleared.' : 'Setup script saved.'} It runs in the next
                fresh worktree of this repo.
              </p>
            )}
            {save.kind === 'error' && <p class="form-error">Couldn't save — {save.message}</p>}

            <div class="modal-actions">
              <button class="btn btn-sm" onClick={onClose} disabled={saving}>
                Close
              </button>
              <button
                class="btn btn-sm btn-primary"
                onClick={() => void onSave()}
                disabled={saving || load.kind === 'loading' || load.kind === 'error'}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
