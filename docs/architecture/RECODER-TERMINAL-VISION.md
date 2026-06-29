# Recoder Terminal — Product Vision

> Captured from the founder's direction. This is the north star for the desktop
> app and the conductor. When a feature decision is ambiguous, it must serve this
> vision or it is out of scope.

## One sentence

**Recoder is a vertical product built on top of all coding terminals/CLIs** —
Claude Code, Codex, pi, opencode, and the rest — delivered as a terminal that is
**cooler than a regular terminal** (think Ghostty) and, at the same time,
**approachable for people who are afraid of terminals**.

## What it is

- A desktop app where users **open the real CLIs they already love** (Claude
  Code first — users love Claude Code) and **use them natively, inside Recoder**.
- A **terminal experience** — not a chat clone, not "any other app." It is a real
  terminal that happens to be beautiful and orchestrated.
- The native CLI experience is **preserved, never reinterpreted**. We do not
  dumb Claude Code down into a generic message UI. The TUI users love stays the
  TUI users love.

## The core tension (and the answer)

Two truths at once:

1. **Power users love the real terminal.** They want the genuine Claude Code /
   Codex / pi experience — full TUI, full fidelity. _Do not change the
   experience._
2. **Many users are afraid of terminals.** A raw terminal is intimidating: scary
   wording ("Pane is dead"), walls of logs, cryptic state.

The answer is **one product with an adjustable surface**:

- Underneath: the **real CLI** runs in a real terminal (tmux + a real PTY).
- On top: a **friendly, Ghostty-cool presentation** — clean conversation framing,
  plain-language status ("Agent finished", not "Pane is dead status 0"), muted
  Cursor-style design, no vibrant noise. Approachable for anyone.
- The user can lean toward **chat-simple** or **full-terminal** without us
  forking the product. Same engine, friendlier skin.

## Why this wins (the market gap)

The terminal-fear problem is **already proven by the vendors themselves**:

- **Claude Code shipped a VS Code / IDE extension** so people who don't want the
  raw terminal can still use it. Using the IDE instead of the CLI is a _bummer_
  compromise — it exists because the terminal scares people.
- **Codex shipped a desktop app** for the same reason.

So the lesson is clear: **a great coding agent needs more than a CLI.** Each
vendor is building their own GUI/app — but only for **their own** CLI.

**Recoder's wedge: do it for all of them, in one place.** Not only a CLI, not only
one vendor:

- A friendly **app/GUI surface** (board, clean conversation, review/merge, visual
  state) for the terminal-averse — like Codex's app or Claude Code's IDE
  extension, but **vendor-neutral**.
- A **cool real terminal** for power users who love the CLI.
- **One product over every coding CLI**, with the agents able to **talk to each
  other** — something no single vendor's app does, because each only ships their
  own.

We are the layer that unifies what each vendor builds in a silo: _not only CLI,
not only one agent, not only one app._

## What makes it "vertical on all coding terminals"

Recoder is not tied to one CLI. It runs **all of them** as first-class runtimes
and adds the layer they don't have on their own:

- **Many real CLIs, one app**: claude_code, codex, opencode, recoder_code, pi,
  gemini_cli, qwen_code, crush — each launched as its real binary.
- **Parallel agents**: each agent in its own **git worktree + tmux session**, so
  many run at once without colliding.
- **Orchestration Recoder owns**: a board (queued/running/review/done), review →
  merge that actually lands work on disk, approvals, artifacts, audit trail.
- **Agentic communication**: agents talk to each other (Claude Code ↔ Codex ↔ pi)
  via the A2A bridge / pal, so one agent can see and hand off to another. This is
  the differentiator — _not any other app_ gives you the real CLIs, beautiful,
  talking to each other, in one terminal.

## Design principles

1. **Real CLI, real terminal.** No fake TTY, no stubbed agent. If it says it ran,
   it ran.
2. **Cooler than a regular terminal.** Ghostty-class polish: fast, clean, muted
   (Cursor palette), the real Recoder cube logo, one-word labels.
3. **Not scary.** Plain language over tmux/pty internals. Hide logs by default,
   surface them on demand. Never show "Pane is dead."
4. **Don't change what users love.** The native Claude Code experience is sacred.
5. **For anyone.** Easy as possible; no big words; backend-heavy, simple front.
6. **Truthful.** Health, review state, and merge results reflect reality.

## Architecture direction (how we get the real terminal)

Today the conductor runs agents **headless** (`claude -p`) in tmux and the cockpit
mirrors captured pane text over HTTP. To deliver the *real terminal* experience:

- **Interactive mode**: run the agent's **real interactive CLI** (`claude`,
  `codex`, `pi`) in the tmux session — not just headless `-p`.
- **Embedded real terminal**: render a true terminal emulator (xterm.js) in the
  cockpit, backed by a **PTY in the Electron main process** running
  `tmux attach -t <session>`. node-pty provides the controlling TTY — this is why
  the old renderer-side `tmux attach` failed ("not a terminal") and why the PTY
  must live in main.
- **Orchestration stays the wrapper**: the board, worktrees, review/merge, and
  agentic messaging surround the terminal; they do not replace it.
- **Friendly layer is presentation only**: the same session can be shown as a
  clean conversation or as the full terminal. Underneath it is always the real
  CLI.

## Status (truthful, this is a living section)

Done + verified live:
- Conductor create → review → **merge lands on disk**; no false "Failed".
- Friendly events (no "Pane is dead"); muted/grey, non-scary cockpit styling.
- **All 8 CLI runtimes available** (claude_code, codex, opencode, recoder_code,
  pi, gemini_cli, qwen_code, crush). `pi` was made a real runnable binary from our
  `@recoder/pi-coding-agent`.

Known blockers / next:
- **Real embedded terminal** (xterm + main-process PTY over `tmux attach`) for the
  interactive native experience — the central piece of this vision.
- **Agentic communication**: the `claude_code` A2A bridge shows `disconnected`
  because the MCP server defaults to the production bridge URL and never points at
  the local backend; wire it to the local bridge so agents see each other.
- **pi credentials**: pi runs but needs a valid provider login to do real work
  (the machine's `OPENAI_API_KEY` is a dead OpenRouter key).
