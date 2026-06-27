<h1 align="center">@recoder/dmux</h1>

<h3 align="center">Recoder operator console — the optional grid over N parallel Conductor agents</h3>

<p align="center">
  The interactive grid view over Recoder's Conductor substrate: one tmux pane per task,
  each in an isolated git worktree, with agent launch and lifecycle hooks.<br/>
  Branch, develop, and merge &mdash; all in parallel.
</p>

<p align="center">
  <a href="https://recoder.xyz"><strong>Recoder</strong></a> &nbsp;&middot;&nbsp;
  <a href="../../docs/subsystems/substrate.md"><strong>Substrate (§4.3)</strong></a> &nbsp;&middot;&nbsp;
  <a href="../../docker-backend/src/conductor/README.md"><strong>Conductor</strong></a>
</p>

<p align="center">
  <strong>Language:</strong>
  <a href="./README.md">English</a> |
  <a href="./README.ja.md">日本語</a>
</p>

---

## What this is

`@recoder/dmux` is the **optional operator console** for Recoder's Conductor. It is a
TypeScript + Ink TUI that gives a human operator a grid view over the parallel agent
panes the Conductor runs. Per `docs/subsystems/substrate.md` §4.3 it is **never on the
critical path**: if dmux is absent, the Conductor is fully functional via tmux alone.

It is vendored and owned by Recoder under `ts/dmux`, forked from the original
[dmux](https://github.com/formkit/dmux) by Justin Schroeder (MIT).

### Shared tmux server (the Conductor bridge)

dmux drives the **same pinned tmux binary** as the Conductor, resolved identically to
`docker-backend/src/conductor/tmux-path.ts`:

1. `DMUX_TMUX_BIN` / `CONDUCTOR_TMUX_BIN` (absolute path override)
2. `RECODER_TMUX_BUILD_PATH` or the vendored `c/tmux/tmux` build
3. system `tmux` on PATH (last resort)

Because both halves share one tmux server, dmux observes and interacts with the
Conductor's `recoder-*` sessions. The backend launches/attaches dmux via
`docker-backend/src/conductor/dmux-adapter.ts`, propagating the pinned tmux env so the
console and the headless conductor always agree on which tmux they drive.

## Quick Start

```bash
# From the Recoder repo, build the operator console:
cd ts/dmux && pnpm run build

# Launch over a repo (the `dmux` and `recoder-dmux` bins are equivalent):
cd /path/to/your/project
recoder-dmux
```

Press `n` to create a new pane, type a prompt, pick one or more agents (or none for a plain terminal), and dmux handles the rest &mdash; worktree, branch, and agent launch.

## What it does

dmux creates a tmux pane for each task. Every pane gets its own git worktree and branch so agents work in complete isolation. When a task is done, open the pane menu with `m` and choose Merge to bring it back into your main branch, or Create GitHub PR to push the branch and file a pull request.

- **Worktree isolation** &mdash; each pane is a full working copy, no conflicts between agents
- **Agent support** &mdash; Claude Code, Codex, OpenCode, Cline CLI, Gemini CLI, Qwen CLI, Amp CLI, pi CLI, Cursor CLI, Copilot CLI, and Crush CLI
- **Goal launches** &mdash; optionally start supported agents in goal mode from the initial prompt
- **Multi-select launches** &mdash; choose any combination of enabled agents per prompt
- **AI naming** &mdash; branches and commit messages generated automatically
- **Smart merging** &mdash; auto-commit, merge, and clean up in one step
- **macOS notifications** &mdash; background panes can send native attention alerts when they settle and need you, with a global off switch
- **Built-in file browser** &mdash; inspect a pane's worktree, search files, and preview code or diffs without leaving dmux
- **Pane visibility controls** &mdash; hide individual panes, isolate one project, or restore everything later without stopping work
- **Multi-project** &mdash; add multiple repos to the same session
- **Lifecycle hooks** &mdash; run scripts on worktree create, pre-merge, post-merge, and more

## Git Branch Controls

dmux can use default branch behavior or let you override branch details when creating a pane.

- Keep the default flow for fast creation, where dmux automatically picks the worktree and git branch names.
- Optionally choose a different base branch per pane.
- Optionally provide an explicit branch/worktree name (useful for issue-tracker ticket naming).
- Multi-agent launches still use shared naming with agent-specific suffixes.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `n` | New pane (worktree + agent) |
| `t` | New terminal pane |
| `j` / `Enter` | Jump to pane |
| `m` | Open pane menu |
| `f` | Browse files in selected pane's worktree |
| `x` | Close pane |
| `h` | Hide/show selected pane |
| `H` | Hide/show all other panes |
| `p` | New pane in another project |
| `P` | Show only the selected project's panes, then show all |
| `s` | Settings |
| `q` | Quit |

## Requirements

- tmux 3.0+
- Node.js 18+
- Git 2.20+
- At least one supported agent CLI (for example [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Codex](https://github.com/openai/codex), [Grok Build](https://docs.x.ai/build/overview), [OpenCode](https://github.com/opencode-ai/opencode), [Cline CLI](https://docs.cline.bot/cline-cli/getting-started), [Gemini CLI](https://github.com/google-gemini/gemini-cli), [Qwen CLI](https://github.com/QwenLM/qwen-code), [Amp CLI](https://ampcode.com/manual), [pi CLI](https://www.npmjs.com/package/@mariozechner/pi-coding-agent), [Cursor CLI](https://docs.cursor.com/en/cli/overview), [Copilot CLI](https://github.com/github/copilot-cli), [Crush CLI](https://github.com/charmbracelet/crush))
- [OpenRouter API key](https://openrouter.ai/) (optional, for AI branch names and commit messages)

## Documentation

- Recoder substrate: **[docs/subsystems/substrate.md](../../docs/subsystems/substrate.md)** §4.3 (operator console).
- Conductor: **[docker-backend/src/conductor/README.md](../../docker-backend/src/conductor/README.md)**.
- Operator-console maintainer guide: **[AGENTS.md](./AGENTS.md)** (config dirs, hooks, agent registry).

## Contributing

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for the recommended local development loop,
hook setup, and PR workflow.

## License

MIT. Forked from [dmux](https://github.com/formkit/dmux) by Justin Schroeder; vendored
and maintained by Recoder.
