import { execFile } from "node:child_process";
import type { TaskGraphPort } from "../ports/task-graph.port";
import type { BrainTask } from "../domain/task-graph.types";
import { resolveExecEngine } from "../runtime/engine-resolver";

/**
 * REAL {@link TaskGraphPort}, backed by the actual beads engine (go/beads) via
 * its `bd` CLI — the same durable issue graph the repo tracks work in.
 *
 * `related` shells `bd ready --json` (the ready-work query) behind an INJECTABLE
 * exec, parses the JSON issue list, and MAPS each `bd` issue into a
 * {@link BrainTask}, including dependency edges (`dependencies` -> dependsOn,
 * `dependents` -> blocks). `update` shells the matching `bd update`/`bd close`.
 *
 * The CLI is consumed as an external tool, never imported, so this package keeps
 * zero dependency on a built beads.
 *
 * Fail-safe doctrine (brain's law): if `bd` is missing, errors, or emits
 * unparseable output, this adapter NEVER throws — `related` degrades to `[]` and
 * `update` becomes a silent no-op. A missing source can only cost richness,
 * never correctness.
 */

/** Runs a command and resolves its stdout (the seam the test fakes). */
export type BeadsExec = (command: string, args: string[]) => Promise<string>;

export interface BeadsTasksOptions {
  /** Override the exec (defaults to execFile against the `bd` binary). */
  exec?: BeadsExec;
  /** Override the binary name/path (defaults to "bd"). */
  bdBin?: string;
}

/** Statuses that mean "this task is finished" — routed through `bd close`. */
const CLOSED_STATUSES: ReadonlySet<string> = new Set([
  "closed",
  "close",
  "done",
  "resolved",
  "completed",
]);

/** Default exec: run the `bd` binary and collect stdout via execFile. */
function defaultExec(command: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(command, args, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

/** A `bd` issue as emitted by the CLI (untrusted external shape). */
interface BeadsIssue {
  id?: unknown;
  title?: unknown;
  status?: unknown;
  dependencies?: unknown;
  dependents?: unknown;
  depends_on?: unknown;
  blocks?: unknown;
  blocked_by?: unknown;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Collect distinct issue ids from a `bd` relation field, accepting both the
 * object-array shape (`[{ id }]`, as `bd show` emits for dependencies) and the
 * plain id-array shape (`["bd-xyz"]`, as molecule/step views emit).
 */
function idsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out = new Set<string>();
  for (const item of value) {
    if (typeof item === "string") {
      if (item) {
        out.add(item);
      }
      continue;
    }
    if (item && typeof item === "object") {
      const id = str((item as { id?: unknown }).id);
      if (id) {
        out.add(id);
      }
    }
  }
  return [...out];
}

/** Map one `bd` issue to a BrainTask, or null when it has no usable id. */
function toTask(issue: BeadsIssue): BrainTask | null {
  const id = str(issue.id);
  if (!id) {
    return null;
  }
  // `dependencies` are issues this one depends on; `dependents` depend on it
  // (i.e. this issue blocks them). Fall back to the id-array shapes if present.
  const dependsOn = [
    ...new Set([...idsFrom(issue.dependencies), ...idsFrom(issue.depends_on)]),
  ];
  const blocks = [
    ...new Set([...idsFrom(issue.dependents), ...idsFrom(issue.blocks)]),
  ];
  const task: BrainTask = {
    id,
    title: str(issue.title),
    status: str(issue.status) || "open",
  };
  return {
    ...task,
    ...(dependsOn.length > 0 ? { dependsOn } : {}),
    ...(blocks.length > 0 ? { blocks } : {}),
  };
}

/** Parse a `bd ... --json` issue list into trusted BrainTasks (or []). */
function parseTasks(stdout: string): BrainTask[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .map((row) => toTask(row as BeadsIssue))
    .filter((task): task is BrainTask => task !== null);
}

/** Build the argv for `bd ready --json` (the seam the test asserts). */
export function buildReadyArgs(limit: number): string[] {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10;
  return ["ready", "--json", "--limit", String(safeLimit)];
}

/** Build the argv for the status write — `bd close` or `bd update --status`. */
export function buildUpdateArgs(
  id: string,
  status: string,
  note?: string,
): string[] {
  if (CLOSED_STATUSES.has(status.trim().toLowerCase())) {
    const args = ["close", id];
    if (note) {
      args.push("--reason", note);
    }
    args.push("--json");
    return args;
  }
  const args = ["update", id, "--status", status];
  if (note) {
    args.push("--notes", note);
  }
  args.push("--json");
  return args;
}

export class BeadsTasks implements TaskGraphPort {
  private readonly exec: BeadsExec;
  /** Command to spawn (an env-pinned path or `bd` on PATH). */
  private readonly cmd: string;
  /** Fixed arg prefix prepended before each bd argv (empty for a bare binary). */
  private readonly argsPrefix: string[];

  constructor(options: BeadsTasksOptions = {}) {
    this.exec = options.exec ?? defaultExec;
    // An explicit binary keeps prior behavior; otherwise honor BD_BIN or `bd`.
    const resolved = resolveExecEngine("bd", options.bdBin);
    this.cmd = resolved.cmd;
    this.argsPrefix = resolved.args;
  }

  async related(query: string, limit: number): Promise<BrainTask[]> {
    try {
      const stdout = await this.exec(this.cmd, [
        ...this.argsPrefix,
        ...buildReadyArgs(limit),
      ]);
      return parseTasks(stdout);
    } catch {
      // bd absent or errored — degrade to empty, never throw.
      return [];
    }
  }

  async update(id: string, status: string, note?: string): Promise<void> {
    if (!id || !status) {
      return;
    }
    try {
      await this.exec(this.cmd, [
        ...this.argsPrefix,
        ...buildUpdateArgs(id, status, note),
      ]);
    } catch {
      // bd absent or errored — silent no-op, never throw.
    }
  }
}

/** Construct the real beads-backed task-graph adapter (opt-in). */
export function createBeadsTasks(options?: BeadsTasksOptions): TaskGraphPort {
  return new BeadsTasks(options);
}
