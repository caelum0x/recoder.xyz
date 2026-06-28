/**
 * FakeSubstrate — an in-memory ConductorSubstrate for contract/engine/observe
 * tests (design §11). It is a REAL, fully-functional implementation of the
 * contract (it provisions, launches, captures, reports liveness, diffs, and
 * tears down against in-memory state) — not a stub. The conformance suite runs
 * its identical assertions against this, and (in later stages) the local and
 * remote substrates, to prove substrate-agnosticism.
 */
import type {
  ConductorSubstrate,
  SubstrateAvailability,
  SubstrateCapabilities,
  SubstrateDiff,
  SubstrateHandle,
  SubstrateLaunchInput,
} from '../../src/contract/index.js';
import type { WorkspaceSubstrate } from '@recoder/agent-os';

interface FakeRun {
  command: string;
  output: string;
  alive: boolean;
  exitCode: number;
  removed: boolean;
}

export interface FakeSubstrateOptions {
  /** The id this fake answers to (defaults to 'tmux_worktree'). */
  id?: WorkspaceSubstrate;
  /** Whether available() reports ready (defaults to true). */
  available?: boolean;
  /** Reason surfaced when available=false. */
  unavailableReason?: string;
  /** Diff returned by diff() (defaults to an empty, well-formed diff). */
  diff?: SubstrateDiff;
}

export class FakeSubstrate implements ConductorSubstrate {
  readonly id: WorkspaceSubstrate;
  readonly #available: boolean;
  readonly #unavailableReason: string;
  readonly #diff: SubstrateDiff;
  readonly #runs = new Map<string, FakeRun>();
  #counter = 0;

  constructor(options: FakeSubstrateOptions = {}) {
    this.id = options.id ?? 'tmux_worktree';
    this.#available = options.available ?? true;
    this.#unavailableReason = options.unavailableReason ?? 'fake substrate disabled';
    this.#diff = options.diff ?? { stat: '', patch: '', untracked: [], changedFiles: 0 };
  }

  capabilities(): SubstrateCapabilities {
    return {
      remote: this.id === 'daytona',
      supportsPty: true,
      supportsInteractiveKeys: true,
      capturesByPolling: true,
      supportsDiff: true,
      supportsIsolationRemoval: true,
    };
  }

  async available(): Promise<SubstrateAvailability> {
    return this.#available
      ? { available: true }
      : { available: false, reason: this.#unavailableReason };
  }

  async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
    const ref = `fake-${input.workspaceId}-${++this.#counter}`;
    this.#runs.set(ref, {
      command: input.command,
      output: `$ ${input.command}\n`,
      alive: true,
      exitCode: 0,
      removed: false,
    });
    return { ref, worktreePath: `/tmp/fake/${ref}`, sessionName: ref };
  }

  /** Test-only: append output and/or finish a run with an exit code. */
  emit(ref: string, output: string, finish?: { exitCode: number }): void {
    const run = this.#runs.get(ref);
    if (!run) throw new Error(`fake run not found: ${ref}`);
    run.output += output;
    if (finish) {
      run.alive = false;
      run.exitCode = finish.exitCode;
    }
  }

  async capture(handle: SubstrateHandle, lines?: number): Promise<string | null> {
    const run = this.#runs.get(handle.ref);
    if (!run || run.removed) return null;
    if (lines === undefined) return run.output;
    return run.output.split('\n').slice(-lines).join('\n');
  }

  async alive(handle: SubstrateHandle): Promise<boolean> {
    const run = this.#runs.get(handle.ref);
    return Boolean(run && !run.removed && run.alive);
  }

  async exitCode(handle: SubstrateHandle): Promise<number | null | undefined> {
    const run = this.#runs.get(handle.ref);
    if (!run || run.removed) return null;
    if (run.alive) return undefined;
    return run.exitCode;
  }

  async diff(handle: SubstrateHandle, _baseRef: string): Promise<SubstrateDiff> {
    const run = this.#runs.get(handle.ref);
    if (!run || run.removed) {
      return { stat: '', patch: '', untracked: [], changedFiles: 0 };
    }
    return this.#diff;
  }

  async teardown(handle: SubstrateHandle, options?: { removeIsolation?: boolean }): Promise<void> {
    const run = this.#runs.get(handle.ref);
    if (!run) return;
    run.alive = false;
    if (options?.removeIsolation) run.removed = true;
  }
}
