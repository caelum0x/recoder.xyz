/**
 * NewWorkspaceForm — the "New workspace" creation form.
 *
 * Runtime options come from GET /runtimes (real availability), substrate context
 * from GET /substrates. Submitting POSTs /workspaces with the body the handler
 * requires: spaceId, projectId, taskId, repoPath, runtimeId, createdBy. The
 * first message (prompt) is OPTIONAL — you can start an empty workspace and chat
 * after it's running; we only send a prompt when one was typed. On success the
 * board refreshes.
 */
import { useEffect, useState } from 'preact/hooks';
import { api, ApiError, BackendUnreachableError } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { readConfig } from '../lib/config';
import { chooseFolder, hasFolderPicker } from '../lib/desktop';
import { isCapabilityGated, capabilityUnlockLabel } from '../lib/plan-state';
import type { CreateWorkspaceBody, GithubRepo, WorkspaceSubstrate } from '../types';

interface NewWorkspaceFormProps {
  onCreated: () => void;
  onClose: () => void;
}

function genTaskId(): string {
  return `task_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function genTaskGroupId(): string {
  return `grp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function NewWorkspaceForm({ onCreated, onClose }: NewWorkspaceFormProps) {
  const defaults = readConfig().defaults || {};
  // The signed-in plan — used only to hint (never block) when a chosen remote
  // substrate will be downgraded to local by the server-side entitlement gate.
  const plan = readConfig().identity?.plan;
  const runtimes = usePoll(() => api.runtimes(), 15_000);
  const substrates = usePoll(() => api.substrates(), 30_000);

  const [repoPath, setRepoPath] = useState(defaults.repoPath || '');
  const [prompt, setPrompt] = useState('');
  const [runtimeId, setRuntimeId] = useState('');
  const [substrate, setSubstrate] = useState<WorkspaceSubstrate | ''>('');
  const [model, setModel] = useState('');
  // Default ON: the real interactive agent TUI is the terminal-first experience.
  const [interactive, setInteractive] = useState(true);
  const [spaceId, setSpaceId] = useState(defaults.spaceId || 'default');
  const [projectId, setProjectId] = useState(defaults.projectId || 'default');
  const [createdBy, setCreatedBy] = useState(defaults.createdBy || 'cockpit');
  const [baseRef, setBaseRef] = useState('');
  const [pickError, setPickError] = useState<string | null>(null);
  // Repos detected from the user's GitHub account (gh, server-side) — a hint
  // for the folder field only. Fetch failures degrade to [] (hint invisible).
  const [githubRepos, setGithubRepos] = useState<GithubRepo[]>([]);
  const [repoHint, setRepoHint] = useState('');
  // Multi-agent parallelism (product F3): extra agents to launch the SAME task
  // with, each in its OWN isolated worktree — the conductor sweet spot. Empty by
  // default; nothing extra launches unless deliberately ticked.
  const [alsoRun, setAlsoRun] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const folderPickerAvailable = hasFolderPicker();
  const allRuntimes = runtimes.data || [];
  const availableRuntimes = allRuntimes.filter((r) => r.available);
  const allSubstrates = substrates.data || [];
  const availableSubstrates = allSubstrates.filter((s) => s.available);

  // Zero-config: preselect the agent the user has installed (the first available
  // CLI, in the backend's preference order) so a fresh form is ready to submit
  // with no dropdown interaction. Only fills an untouched field — a deliberate
  // choice (or a cleared select) is never overridden.
  useEffect(() => {
    if (runtimeId || availableRuntimes.length === 0) return;
    setRuntimeId(availableRuntimes[0].runtimeId);
  }, [runtimes.data]);

  // One-shot: the detected account's repos as a folder hint. Any failure
  // (backend down, gh absent, signed out) leaves the list empty — no hint.
  useEffect(() => {
    let cancelled = false;
    api
      .githubRepos()
      .then((repos) => {
        if (!cancelled) setGithubRepos(repos);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

    // Folder + agent are required to launch a workspace. The first message is
    // OPTIONAL: goals change, so we never force one upfront — you can start with
    // an empty workspace and chat after it's running.
    if (!repoPath.trim() || !runtimeId) {
      setError('Please pick a folder and choose an agent.');
      return;
    }

    // The primary agent plus any deliberately-ticked parallel agents — one
    // workspace (own worktree, own taskId) per agent, same folder + task.
    const agents = [runtimeId, ...alsoRun.filter((id) => id !== runtimeId)];

    // Multi-agent parallelism (F3): when launching the SAME task across 2+ agents,
    // stamp every sibling with ONE shared taskGroup so the compare board can
    // aggregate them side-by-side. A solo launch stays ungrouped (no tag).
    const taskGroup = agents.length > 1 ? genTaskGroupId() : undefined;

    const bodyFor = (agent: string): CreateWorkspaceBody => {
      const body: CreateWorkspaceBody = {
        spaceId: spaceId.trim() || 'default',
        projectId: projectId.trim() || 'default',
        taskId: genTaskId(),
        repoPath: repoPath.trim(),
        runtimeId: agent,
        createdBy: createdBy.trim() || 'cockpit',
      };
      if (taskGroup) body.taskGroup = taskGroup;
      // Only send a prompt when the operator actually wrote one.
      if (prompt.trim()) body.prompt = prompt.trim();
      if (substrate) body.substrate = substrate;
      if (model.trim()) body.model = model.trim();
      if (interactive) body.interactive = true;
      if (baseRef.trim()) body.baseRef = baseRef.trim();
      return body;
    };

    setSubmitting(true);
    try {
      // Sequential launches, truthful partial results: every workspace that
      // started stays started; the first failure names its agent and stops.
      let started = 0;
      try {
        for (const agent of agents) {
          await api.createWorkspace(bodyFor(agent));
          started += 1;
        }
      } catch (err) {
        if (started > 0) onCreated();
        const failed = agents[started];
        const detail =
          err instanceof BackendUnreachableError
            ? `Can't reach the backend: ${err.message}`
            : err instanceof ApiError
              ? `(${err.status}) ${err.message}`
              : err instanceof Error
                ? err.message
                : 'launch failed';
        setError(
          started > 0
            ? `Started ${started} of ${agents.length} — ${failed}: ${detail}`
            : `Couldn't start the workspace — ${failed}: ${detail}`,
        );
        return;
      }
      onCreated();
      onClose();
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
          {/* Folder hint (product F2): repos detected on the user's GitHub
              account. Reference only — we can't truthfully know where a repo
              is cloned locally, so the folder input stays authoritative. Shown
              only while the folder is empty; an empty list renders nothing. */}
          {!repoPath.trim() && githubRepos.length > 0 && (
            <select
              aria-label="Your GitHub repos (reference)"
              value={repoHint}
              onChange={(e) => setRepoHint((e.target as HTMLSelectElement).value)}
            >
              <option value="">your GitHub repos (reference)…</option>
              {githubRepos.map((r) => (
                <option key={r.nameWithOwner} value={r.nameWithOwner}>
                  {r.nameWithOwner}
                </option>
              ))}
            </select>
          )}
          {!repoPath.trim() && repoHint && (
            <span class="field-hint">Type the local path where {repoHint} is cloned.</span>
          )}
        </label>

        <label class="field">
          <span>First message (optional)</span>
          <textarea
            rows={4}
            placeholder="Optionally start the agent with a message — or leave this empty and chat once it's running…"
            value={prompt}
            onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
          />
          <span class="field-hint">You don't need a goal upfront — you can start empty and message the agent in the conversation.</span>
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

        {/* Multi-agent parallelism (product F3): launch the SAME task with other
            installed agents, each in its own isolated worktree — compare on the
            board, review each on its own schedule. Only OTHER available CLIs are
            offered; nothing is preticked. Hidden when there is no other agent. */}
        {availableRuntimes.filter((r) => r.runtimeId !== runtimeId).length > 0 && (
          <div class="field">
            <span>Also run in parallel (optional)</span>
            <div class="field-check-row">
              {availableRuntimes
                .filter((r) => r.runtimeId !== runtimeId)
                .map((r) => (
                  <label key={r.runtimeId} class="field-check" title={`Also run this task with ${r.runtimeId} in its own worktree`}>
                    <input
                      type="checkbox"
                      checked={alsoRun.includes(r.runtimeId)}
                      onChange={(e) =>
                        setAlsoRun((prev) =>
                          (e.target as HTMLInputElement).checked
                            ? [...prev, r.runtimeId]
                            : prev.filter((id) => id !== r.runtimeId),
                        )
                      }
                    />
                    <span>{r.runtimeId}</span>
                  </label>
                ))}
            </div>
          </div>
        )}

        <label class="field-check" title="Run the agent's real interactive TUI (Claude Code / Codex / …) in the terminal, instead of a one-shot headless run">
          <input
            type="checkbox"
            checked={interactive}
            onChange={(e) => setInteractive((e.target as HTMLInputElement).checked)}
          />
          <span>Interactive terminal — run the real agent TUI (recommended)</span>
        </label>

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
            {/* Calm, non-blocking hint: remote (Daytona) needs the paid remote_substrate
                capability. On a gating plan the server runs it locally instead — tell the
                operator up front so the downgrade isn't a surprise. Presentation-only. */}
            {substrate === 'daytona' && isCapabilityGated(plan, 'remote_substrate') && (
              <span class="field-hint">
                Remote (Daytona) runs on {capabilityUnlockLabel('remote_substrate')}+ — on your
                plan this will run locally.
              </span>
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
