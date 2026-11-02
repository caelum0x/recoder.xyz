# Recoder

**Run Claude Code, Codex, Cursor, and opencode in parallel — each in its own git worktree — then compare their diffs and merge the best result.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Open source and self-hosted. The hosted service at recoder.xyz is retired: you run the desktop app on your own machine, with the agent CLIs and model keys you already have.

<!-- TODO: add a real screen recording at docs/demo.gif (two agents on one task, then compare, then merge). Do not commit a fabricated or placeholder image. Uncomment the line below once docs/demo.gif exists. -->

<!-- ![Recoder: parallel agents, compare, merge](docs/demo.gif) -->

## Why

One coding agent gives you one attempt. Several agents give you several branches, and then you are the person diffing them by hand. Recoder gives each agent its own git worktree, puts the diffs on one screen, and merges the result you keep.

## Features

- Parallel runs of the coding-agent CLIs already on your machine
- One git worktree per agent, so runs do not overwrite each other
- Side-by-side diff compare, including which files more than one agent changed
- Converge onto a fresh branch: keep a single agent's file, or a 3-way merge when the edits do not overlap
- A governance check on the merge, plus an evidence record of the task, the candidate diffs, and the verdict
- Your keys stay with the agents. Recoder drives the CLIs you already authenticated

## Quickstart

Launch the desktop app from this repo. From `apps/desktop`, `task dev` is the `electron:dev` task in [`apps/desktop/Taskfile.yml`](apps/desktop/Taskfile.yml). It installs the desktop workspace dependencies, builds the Go server, and runs the `dev` script in [`apps/desktop/app/package.json`](apps/desktop/app/package.json) (`electron-vite dev`).

Prerequisites, from [`apps/desktop/BUILD.md`](apps/desktop/BUILD.md):

- Node.js 22
- pnpm 10.30.3 (the `packageManager` field in the root `package.json`)
- Go
- [Task](https://taskfile.dev/installation/)
- On Linux, `zip` and [Zig](https://ziglang.org/) (the Go server links CGO with Zig)
- On Windows, [Zig](https://ziglang.org/). `task dev` builds the server with `zig cc` (`build:server:windows` in [`apps/desktop/Taskfile.yml`](apps/desktop/Taskfile.yml))

```bash
git clone https://github.com/caelum0x/recoder.xyz.git
cd recoder.xyz
corepack enable
corepack prepare pnpm@10.30.3 --activate
cd apps/desktop
task dev
```

Parallel runs need at least two different agent CLIs on your `PATH` (for example `claude`, `codex`, `opencode`, or `cursor-agent`). One CLI can launch a single agent in its own worktree. Fan-out rejects fewer than two distinct agent kinds, so the same CLI twice still counts as one. Open a local git repo, describe a task, and launch two or more agents. Compare the diffs, choose the files you want, and merge.

`task package` from `apps/desktop` writes a local install under `apps/desktop/make/`. The full native-engine build from the repo root is `pnpm run build:recoder:product`.

To run the control plane (Postgres, governance, memory) on a Linux host, see [`docs/SELF-HOST.md`](docs/SELF-HOST.md). That path is `scripts/selfhost-up.sh` after `backend/dist/server.js` exists (`pnpm install` and `pnpm build` in `backend/`).

## Supported agents

The conductor launches an agent when its binary is on your `PATH` ([`packages/substrate/src/command/runtime-specs.ts`](packages/substrate/src/command/runtime-specs.ts)). A missing binary is reported as unavailable.

| Agent | Binary |
| --- | --- |
| Claude Code | `claude` |
| Codex | `codex` |
| opencode | `opencode` |
| Cursor | `cursor-agent` |
| Recoder Code | `recoder-code` |
| pi | `pi` |
| Gemini CLI | `gemini` |
| Qwen Code | `qwen` |
| Crush | `crush` |

The `cursor` editor binary is attach-only. Launch needs `cursor-agent`. An in-process runtime, `openfang`, is separate from this CLI list.

## How it works

1. **Worktree isolation.** Each selected agent gets its own git worktree for the same task. The runs do not share a working tree.
2. **Diff compare.** Compare lists each agent's diff, which files are contested, and whether a run is ready to merge.
3. **Merge.** Converge writes a new branch. A file only one agent changed is kept as-is. A file several agents changed is either one agent's version or a 3-way merge when the edits do not overlap. A real line conflict is shown. The merge passes the governance gate, which records the task, the candidate diffs, and the verdict.

Walkthrough: [`docs/guide/05-review-converge-merge.md`](docs/guide/05-review-converge-merge.md). Architecture: [`docs/RECODER-ARCHITECTURE.md`](docs/RECODER-ARCHITECTURE.md).

## Roadmap

In this repo today: parallel worktrees, diff compare, converge, and a governed merge, from the desktop app.

Next:

- A real demo recording at `docs/demo.gif`
- Packaged Linux and Windows builds you can install without a from-source dev loop
- A shorter Linux dev boot. `task electron:quickdev` builds an arm64 macOS server only

### Good first issues

These are ideas, not filed tickets. Open one if you want to take it.

1. **Demo GIF.** Record a real two-agent run through compare and merge, and add it at `docs/demo.gif`. The README slot above is waiting.
2. **Install guide.** [`docs/guide/02-install.md`](docs/guide/02-install.md) still sends people to the retired recoder.xyz download page. Point it at the quickstart on this page.
3. **Repository URL.** The root `package.json` `repository.url` is `https://github.com/recoder-team/recoder`. This git remote is `https://github.com/caelum0x/recoder.xyz`.
4. **Package description.** The root `package.json` `description` still says "AI-powered development platform with production-ready code generation." Align it with the one-line value prop above.
5. **Linux quickdev.** Add a current-architecture Linux task beside `electron:quickdev` in [`apps/desktop/Taskfile.yml`](apps/desktop/Taskfile.yml), so a Linux dev loop can skip the full `wsh` cross-compile.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bugs and feature requests use the templates in `.github/ISSUE_TEMPLATE/`.

## License

Recoder's own code is [MIT](LICENSE). Vendored projects, including the Wave Terminal fork under `apps/desktop`, keep their original licenses. See [NOTICE](NOTICE).

## Docs

- [User guide](docs/guide/README.md)
- [Architecture](docs/RECODER-ARCHITECTURE.md)
- [Self-hosting the control plane](docs/SELF-HOST.md)
