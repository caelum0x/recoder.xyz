/**
 * Native agent-session RESUME registry (absorb herdr #4).
 *
 * A crashed `running` workspace whose substrate PTY is gone can be recovered
 * LOSSLESSLY when the underlying agent CLI has its OWN durable session: instead of
 * finalizing the run to `failed` and losing the agent's in-flight history, the
 * reconciler relaunches the agent's native `--resume`/`resume`/`--session` flow so
 * the AGENT replays its own history. This module owns the per-runtime knowledge of
 * HOW to resume — nothing else needs to know a runtime's resume flag.
 *
 * Injection-safety is the whole point: the session id / path is carried as an argv
 * DATA element (never interpolated into shell text) and is validated before it is
 * ever placed into an argv (empty / overlong / control-char / leading-dash refs are
 * rejected, and path-kind refs must be absolute). A ref that could be re-read as a
 * CLI flag (leading `-`) is refused so it can never smuggle in another option.
 *
 * Confirmed against each driver's real resume seam before it was added here:
 *  - claude_code → `claude --resume <sessionId>`   (drivers/claude-code/claude-args.ts)
 *  - opencode    → `opencode run --session <id>`    (drivers/opencode/opencode-args.ts)
 *  - codex       → `codex resume <id>`              (codex resume subcommand)
 *  - pi          → `pi --session <absolute-path>`   (pi session host; path-addressed)
 *
 * A runtime with NO native resume is simply absent from the table ⇒ `resumePlan`
 * returns `null` and that workspace stays truthfully finalized-to-failed.
 */

/** The relaunch argv for a native resume. `argv[0]` is the CLI binary. */
export interface ResumePlan {
  readonly argv: string[];
}

/** Whether a runtime addresses its resumable session by opaque id or by fs path. */
type ResumeRefKind = 'id' | 'path';

interface RuntimeResumeSpec {
  readonly kind: ResumeRefKind;
  /** Build the full argv (`argv[0]` = binary) that natively resumes `ref`. */
  readonly build: (ref: string) => string[];
}

/** A session ref longer than this is rejected as malformed (never placed in argv). */
const MAX_REF_LENGTH = 512;

/**
 * Per-runtime native-resume specs, keyed by the agent-os runtime SURFACE id carried
 * on `Workspace.runtimeId`. `recoder_code` is the first-party surface pi backs, so
 * it shares pi's path-addressed resume.
 */
const RESUME_SPECS: Readonly<Record<string, RuntimeResumeSpec>> = {
  claude_code: { kind: 'id', build: ref => ['claude', '--resume', ref] },
  opencode: { kind: 'id', build: ref => ['opencode', 'run', '--session', ref] },
  codex: { kind: 'id', build: ref => ['codex', 'resume', ref] },
  pi: { kind: 'path', build: ref => ['pi', '--session', ref] },
  recoder_code: { kind: 'path', build: ref => ['pi', '--session', ref] },
};

/** True when `value` contains an ASCII control char (C0 range or DEL). */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * Validate a session ref for a given kind. Rejects empty (after trim), overlong,
 * control-char, surrounding-whitespace, and leading-dash refs (a leading `-` could
 * be re-read as a CLI flag); a `path`-kind ref must additionally be absolute.
 */
function isValidRef(ref: string, kind: ResumeRefKind): boolean {
  if (typeof ref !== 'string') return false;
  if (ref.trim().length === 0) return false;
  if (ref !== ref.trim()) return false;
  if (ref.length > MAX_REF_LENGTH) return false;
  if (hasControlChar(ref)) return false;
  if (ref.startsWith('-')) return false;
  if (kind === 'path' && !ref.startsWith('/')) return false;
  return true;
}

/**
 * Build the native-resume relaunch plan for `runtimeId` + `sessionRef`, or `null`
 * when the runtime has no native resume or the ref fails validation. The returned
 * argv carries the ref as a discrete DATA element — never shell-interpolated.
 */
export function resumePlan(
  runtimeId: string,
  sessionRef: string
): ResumePlan | null {
  const spec = RESUME_SPECS[runtimeId];
  if (spec == null) return null;
  if (sessionRef == null) return null;
  if (!isValidRef(sessionRef, spec.kind)) return null;
  return { argv: spec.build(sessionRef) };
}

/**
 * Stable, collision-free dedupe key for a (runtimeId, sessionRef) pair so two
 * workspaces can never resume the SAME native session, and a session is resumed at
 * most once per reconcile pass. The space separator cannot appear at the join seam
 * of a valid runtime id, so distinct pairs always produce distinct keys.
 */
export function dedupeKey(runtimeId: string, sessionRef: string): string {
  return `${runtimeId} ${sessionRef}`;
}

/** True when `runtimeId` has a native resume seam registered. */
export function hasNativeResume(runtimeId: string): boolean {
  return RESUME_SPECS[runtimeId] != null;
}
