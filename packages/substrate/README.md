# @recoder/substrate

> The swappable, restart-survivable execution layer under every Conductor workspace.

`@recoder/substrate` is the owned engine behind Recoder's Conductor: the layer that
provisions isolation for a unit of work, launches the user's **own** coding-agent CLI
(Claude Code, Codex, opencode, Recoder Code, pi, Gemini CLI, Qwen Code, crush) headless
inside that isolation, observes the run, and tears down — over **one contract**
(`ConductorSubstrate`), with two real backends: local `tmux` + git worktrees, and remote
Daytona sandboxes.

It is the first-class promotion of the proven code in `docker-backend/src/conductor/*`.
The backend keeps a thin adapter (`/api/conductor` routes, container glue, reconcile cron);
the engine lives here.

## Design rules

- **Backend-free.** This package depends on **`@recoder/agent-os` only** (for the canonical
  `Workspace` domain). Everything else — logger, repository, Daytona client, brain,
  governance, metrics, run-event sink — is an **injected port** (`src/ports/*`). The backend
  provides the concrete adapters; tests provide fakes.
- **Never owns canonical state.** Task / run / approval / artifact / memory state lives in
  `@recoder/agent-os` and is reached through the repository port. The substrate is an adapter
  around Recoder state, not an owner of it.
- **Truthful, never faked.** `available()` reports missing `git` / `tmux` / `gh` / Daytona
  creds as `{ available: false, reason }`. Errors are a typed `SubstrateError` hierarchy with
  stable codes — no string-matching, no fake success.
- **Security-critical quoting in one place.** Untrusted prompts pass through a single POSIX
  single-quote chokepoint (`shellQuote`) before they touch any shell command line.

## Contract

```ts
import type { ConductorSubstrate } from '@recoder/substrate';

interface ConductorSubstrate {
  id: WorkspaceSubstrate;                 // 'tmux_worktree' | 'daytona' | 'in_process'
  capabilities(): SubstrateCapabilities;  // remote? supportsPty? supportsDiff? …
  available(): Promise<SubstrateAvailability>;
  launch(input: SubstrateLaunchInput): Promise<SubstrateHandle>;
  capture(handle, lines?): Promise<string | null>;   // null when the handle is gone
  alive(handle): Promise<boolean>;
  diff(handle, baseRef): Promise<SubstrateDiff>;
  teardown(handle, { removeIsolation? }): Promise<void>;
}
```

## Command resolution (self-contained, shipped)

Resolve a runtime + prompt into the exact headless CLI line run inside the isolation:

```ts
import { resolveRuntimeCommand, runtimeAvailability } from '@recoder/substrate';

resolveRuntimeCommand('claude_code', { prompt: 'fix the bug' }).commandLine;
// => "claude -p 'fix the bug' --permission-mode acceptEdits"

await runtimeAvailability();
// => [{ runtimeId: 'claude_code', bin: 'claude', available: true, path: '/usr/local/bin/claude' }, …]
```

The 8 real headless invocations:

| runtime        | bin           | line                                                                |
|----------------|---------------|---------------------------------------------------------------------|
| `claude_code`  | `claude`      | `claude -p '<prompt>' --permission-mode acceptEdits [--model …]`    |
| `codex`        | `codex`       | `codex exec '<prompt>' [--model …]`                                 |
| `opencode`     | `opencode`    | `opencode run '<prompt>' [--model …]`                               |
| `recoder_code` | `recoder-code`| `recoder-code --prompt '<prompt>' [--model …]`                      |
| `pi`           | `pi`          | `pi '<prompt>' [--model …]`                                         |
| `gemini_cli`   | `gemini`      | `gemini --prompt '<prompt>' [--model …]`                            |
| `qwen_code`    | `qwen`        | `qwen --prompt '<prompt>' [--model …]`                              |
| `crush`        | `crush`       | `crush -p '<prompt>' [--model …]`                                   |

## Registry + factory

```ts
import { createSubstrateRegistry, selectSubstrate } from '@recoder/substrate';

const registry = createSubstrateRegistry({ substrates: [tmuxSubstrate, daytonaSubstrate] });
const substrate = selectSubstrate(registry, workspace);  // by Workspace.substrate
```

The registry is an **instance**, not a process global — the engine, tests, and the backend
each own their wiring.

## Package layout

```
src/
  contract/   ConductorSubstrate + its data shapes (the seam)
  types/      ConductorRuntimeId, ResolvedRuntimeCommand, ReconcileReport, …
  errors/     SubstrateError hierarchy + isSubstrateError + toErrorPayload
  command/    RUNTIME_SPECS, resolveRuntimeCommand, shellQuote (8 real CLIs)
  exec/       execFileSafe, which, commandExists (shared primitives)
  registry/   SubstrateRegistry, selectSubstrate
  ports/      RepositoryPort, LoggerPort, ClockPort, IdPort, BrainPort,
              GovernancePort, MetricsPort, RunEventSink, MemoryCandidatePort
  factory/    createSubstrateRegistry, resolvePorts, systemClock, uuidId
```

> **Stage status.** This package currently ships the **foundation + self-contained modules**
> (contract, types, errors, ports, registry, command, exec, factory). The riskier impl moves —
> `local/` (tmux + worktrees), `remote/` (Daytona), `engine/`, `reconcile/`, `observe/`,
> `review/`, `publish/` — land in later steps per `substrate.md` §12 and are intentionally
> **not stubbed**.

## Verify

```bash
pnpm -F @recoder/substrate check-types   # tsc --noEmit (0 errors)
pnpm -F @recoder/substrate test          # node:test + tsx unit + contract conformance
pnpm -F @recoder/substrate build         # tsup esm + cjs + d.ts
```
