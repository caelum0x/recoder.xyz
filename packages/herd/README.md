# @recoder/herd — your agents at a glance, in the terminal

`recoder-herd` is a zero-dependency terminal view over the Recoder conductor
API. Every workspace at a glance, triaged by what needs you:

```
RECODER HERD  1 needs you · 2 working · 0 failed · 3 done  http://127.0.0.1:3100

 NEEDS YOU
  ● add a HELLO.txt that says hi        claude_code  needs input     32s  [1]
      ↳ Do you want to allow this command?
 WORKING
  ◐ refactor the auth module            codex        running          8s  [2]
  ◐ write the API docs                  pi           running         14s  [3]
 DONE
  ✓ fix the flaky test                  claude_code  merged           2m  [4]
```

## Run it

From the repo root (builds + runs):

```bash
pnpm herd            # interactive: digit keys attach, r refresh, q quit
pnpm herd:once       # print one frame and exit (scriptable)
```

Or the built binary directly:

```bash
node packages/herd/dist/cli.js --backend http://127.0.0.1:3100
```

## What it shows

- **NEEDS YOU** — an agent blocked on an interactive prompt (the prompt line is
  shown under the row), or a workspace `awaiting_review` / `awaiting_approval` /
  `changes_requested`. These are where you unblock the fleet.
- **WORKING** — `created` / `setting_up` / `ready` / `running` / `merging`.
- **FAILED** — a crashed or refused workspace.
- **DONE** — `merged` / `cancelled` / `archived`.

Rows are labeled by their **goal** (the original prompt), not the opaque branch.

## Attach to an agent

Press the digit key next to a row (`[1]`, `[2]`, …) to hand your terminal to
that workspace's live `tmux` session — a real terminal view of the agent, not a
wrapped interpretation. Detach with `ctrl+b d` and you're back in the herd;
the agent keeps running.

## Config

| env | default | meaning |
|-----|---------|---------|
| `RECODER_BACKEND` | `http://127.0.0.1:3001` | conductor backend URL (the desktop app uses `:3100`) |
| `RECODER_TOKEN` | — | bearer token when the backend requires auth (solo/local needs none) |
| `HERD_TMUX_BIN` | `tmux` | tmux binary for attach |

## Design

Canonical state stays in the conductor control plane; this package only reads
`/api/conductor/workspaces` (+ per-workspace events to detect blocked-on-input)
and attaches to sessions. It owns no state. The triage rules
(`herdStatus`, `waitingPrompt`) are pure and unit-tested.
