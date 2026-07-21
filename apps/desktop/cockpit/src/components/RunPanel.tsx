/**
 * RunPanel — the "Run" tab: run the workspace's app (its dev server) in a real
 * tmux session and watch it live, conductor-style ("Start Run"). Reuses the
 * existing conductor session plumbing (POST /sessions in the worktree) and the
 * HTTP /sessions/:id/output poll — no terminal infrastructure (the cockpit no
 * longer embeds terminals; wave-desktop fusion §5).
 *
 * The dev command is detected from the project (GET /dev-command) but stays
 * editable, so a user can run anything. Truthful + degrade-safe: a workspace with
 * no worktree can't run; a failed start surfaces the real error, never a fake
 * "running" state.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../lib/api';
import { usePoll } from '../lib/usePoll';
import { extractPreviewUrl } from '../lib/preview-url';
import { formatPreviewVerifyLine } from '../lib/preview-verify-line';
import type { ConductorSession, Workspace } from '../types';

interface RunPanelProps {
  workspace: Workspace;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The live run: a control bar (command + detected preview link + Stop) over the
 * streamed session terminal. The preview URL is sniffed from the session output
 * so an "Open preview" link appears once the dev server announces its port.
 */
function RunningView({
  session,
  workspaceId,
  busy,
  onStop,
}: {
  session: ConductorSession;
  workspaceId: string;
  busy: boolean;
  onStop: () => void;
}) {
  const output = usePoll(() => api.sessionOutput(session.sessionId, 200), 3000, [session.sessionId]);
  const previewUrl = extractPreviewUrl(output.data?.output);
  const screenRef = useRef<HTMLDivElement>(null);

  // The last preview verification the backend persisted (setPreviewUrl auto-verifies
  // and writes back a compact summary). Only polled once a preview URL exists so the
  // "preview checked" line sits under the preview link; a never-verified workspace
  // is a truthful 404 → null → muted "preview not checked", never a fabricated pass.
  const verification = usePoll(
    () => (previewUrl ? api.previewVerification(workspaceId) : Promise.resolve(null)),
    8000,
    [workspaceId, previewUrl],
  );
  const verifyLine = previewUrl ? formatPreviewVerifyLine(verification.data) : null;

  // Keep the live output pinned to the bottom as new lines arrive.
  useEffect(() => {
    const el = screenRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [output.data]);

  // Persist the sniffed dev-server URL to the workspace so the agent-facing
  // preview engine (preview.health) and the board can light up. Fire once per
  // distinct URL; best-effort — a failure never affects this live run view (the
  // link above still opens locally). If persistence fails we clear the marker so
  // a later poll retries.
  const postedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!previewUrl || postedRef.current === previewUrl) return;
    postedRef.current = previewUrl;
    api.setPreviewUrl(workspaceId, previewUrl).catch(() => {
      if (postedRef.current === previewUrl) postedRef.current = null;
    });
  }, [previewUrl, workspaceId]);

  return (
    <div class="run-panel">
      <div class="run-panel-bar">
        <span class="run-panel-cmd" title={session.command}>{session.command}</span>
        <span class="run-panel-spacer" />
        {previewUrl && (
          <a class="run-panel-preview" href={previewUrl} target="_blank" rel="noreferrer" title={previewUrl}>
            Open preview ↗
          </a>
        )}
        <button class="btn btn-sm btn-danger" onClick={onStop} disabled={busy}>
          {busy ? 'Stopping…' : 'Stop'}
        </button>
      </div>
      {/* Terminal-plain verification line under the preview link — the glyph carries
          the verdict (no engine name). No screenshot is retained in this cut, so a
          truthful "screenshot not retained" note stands in for a broken image. */}
      {verifyLine && (
        <div class="run-panel-detected run-panel-verify" title={verifyLine.text}>
          <span class="run-panel-verify-text">{verifyLine.text}</span>
          {verifyLine.screenshotRef ? (
            <a
              class="run-panel-preview"
              href={verifyLine.screenshotRef}
              target="_blank"
              rel="noreferrer"
            >
              screenshot ↗
            </a>
          ) : verifyLine.screenshotNote ? (
            <span class="run-panel-verify-shot">· {verifyLine.screenshotNote}</span>
          ) : null}
        </div>
      )}
      {/* Read-only live output of the run's tmux pane over the same HTTP poll
          that feeds the preview sniffer — truthful: errors and emptiness are
          shown as-is, never a fabricated "running" screen. */}
      <div class="run-panel-screen" ref={screenRef}>
        {output.error ? (
          <span class="log-error">Output unavailable: {output.error.message}</span>
        ) : output.data?.output ? (
          <pre class="run-panel-buffer">{output.data.output}</pre>
        ) : (
          <span class="log-empty">Waiting for output…</span>
        )}
      </div>
    </div>
  );
}

export function RunPanel({ workspace }: RunPanelProps) {
  const runSessionId = `run-${workspace.workspaceId}`;
  const canRun = Boolean(workspace.worktreePath);

  // Detected dev command (best-effort) — prefills the editable command box.
  const detected = usePoll(
    () => (canRun ? api.devCommand(workspace.workspaceId) : Promise.resolve(null)),
    120_000,
    [workspace.workspaceId, canRun],
  );

  const [command, setCommand] = useState('');
  const [session, setSession] = useState<ConductorSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whether the user has typed into the command box. Tracked with a ref (not
  // `!command`) so that after a workspace switch the newly detected command can
  // overwrite the previous workspace's stale prefill — usePoll keeps the old
  // detected value until the new fetch resolves, so gating on `!command` alone
  // would lock in the wrong worktree's command.
  const editedRef = useRef(false);

  // Prefill the command from detection until the user has typed their own.
  useEffect(() => {
    if (!editedRef.current && detected.data?.command) setCommand(detected.data.command);
  }, [detected.data]);

  // Reset when switching workspaces so the new workspace's detected command
  // prefills instead of launching the previous workspace's command.
  useEffect(() => {
    setSession(null);
    setError(null);
    setCommand('');
    editedRef.current = false;
  }, [workspace.workspaceId]);

  async function start() {
    if (!canRun || !command.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const s = await api.startSession({
        sessionId: runSessionId,
        repoPath: workspace.worktreePath as string,
        command: command.trim(),
      });
      setSession(s);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await api.killSession(runSessionId, true); // keep the worktree; only kill the run
    } catch (err) {
      setError(errText(err));
    } finally {
      setSession(null);
      setBusy(false);
    }
  }

  if (!canRun) {
    return <div class="run-panel-empty">This workspace has no worktree to run yet.</div>;
  }

  if (session) {
    return (
      <RunningView
        session={session}
        workspaceId={workspace.workspaceId}
        busy={busy}
        onStop={stop}
      />
    );
  }

  return (
    <div class="run-panel">
      <div class="run-panel-start">
        <label class="run-panel-label">Run command</label>
        <input
          class="run-panel-input"
          value={command}
          placeholder={detected.loading ? 'Detecting…' : 'e.g. pnpm run dev'}
          onInput={(e) => {
            editedRef.current = true;
            setCommand((e.target as HTMLInputElement).value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') start();
          }}
        />
        <button class="btn btn-primary btn-sm" onClick={start} disabled={busy || !command.trim()}>
          {busy ? 'Starting…' : 'Start Run'}
        </button>
        {detected.data?.label && (
          <span class="run-panel-detected">detected: {detected.data.label}</span>
        )}
        {error && <p class="run-panel-error">{error}</p>}
      </div>
    </div>
  );
}
