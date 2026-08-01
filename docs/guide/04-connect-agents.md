# Connect your coding agents

Recoder drives the agent CLIs you already have installed. It does **not** bundle or
resell them — you keep using each agent exactly as its vendor intended, with your
own auth. Recoder detects what's on your `PATH` and orchestrates them.

## How detection works

On launch (and whenever you refresh), Recoder probes your `PATH` for supported
agent CLIs via its `/api/conductor/runtimes` endpoint. Each agent shows as:

- **available** — the CLI is installed and on your `PATH`, and (best-effort) its
  auth looks present, so you can select it for a run;
- **not detected** — the CLI isn't on your `PATH`; install it and refresh.

Detection is a fresh `PATH` probe, so if you install an agent while Recoder is
open, just refresh — no restart needed.

> Recoder never fabricates availability. If an agent isn't installed or
> authenticated, it says so instead of failing mid-run.

## Supported runtimes

Recoder recognizes these coding-agent runtimes (shown with their display names):

| Runtime | Display name | Notes |
|---|---|---|
| `claude_code` | **Claude Code** | Anthropic's CLI. See below. |
| `codex` | **Codex** | OpenAI Codex CLI. |
| `opencode` | **opencode** | Open-source agent CLI. |
| `cursor` | **Cursor** | Cursor's CLI agent. |
| `gemini_cli` | **Gemini CLI** | Google Gemini CLI. |
| `qwen_code` | **Qwen Code** | Qwen coding CLI. |
| `crush` | **Crush** | Charm's Crush. |
| `pi` | **pi** | pi agent. |
| `recoder_code` | **Recoder Code** | Recoder's own runtime. |

The list you actually see is whatever is installed on your machine.

## Setting up the common agents

The pattern is the same for every agent: **install its CLI, authenticate it the
way you normally would, make sure it's on your `PATH`**, then refresh Recoder.

### Claude Code

1. Install Claude Code (`claude`) per Anthropic's instructions and confirm it runs:
   ```bash
   claude --version
   ```
2. Authenticate as you normally do (interactive login, or an `ANTHROPIC_API_KEY`
   in your environment — see [BYOK](./07-byok-and-keys.md)).
3. Refresh Recoder — **Claude Code** should show as available.

### Codex

1. Install the Codex CLI and confirm it's on your `PATH`:
   ```bash
   codex --version
   ```
2. Authenticate it (its login flow, or `OPENAI_API_KEY` in your environment).
3. Refresh Recoder — **Codex** should show as available.

### opencode

1. Install opencode and confirm:
   ```bash
   opencode --version
   ```
2. Configure its provider/key as you normally would.
3. Refresh Recoder — **opencode** should show as available.

### Other agents (Cursor, Gemini CLI, Qwen Code, Crush, pi)

Same recipe: install the CLI, authenticate it, ensure it's on your `PATH`, refresh
Recoder. Whatever is detected becomes selectable for a run.

## Keys and auth: who owns what

Recoder **inherits your shell environment**, so agents pick up the same provider
keys and config they use when you run them directly. Recoder does not intercept,
proxy, or resell those tokens — it orchestrates the agents; the agents talk to
their providers with your keys. See [BYOK](./07-byok-and-keys.md) for how keys
flow and how to set them for Recoder-managed inference.

## Running several at once

In the launch panel, select **two or more** detected agents for a task. Recoder
gives each its own worktree and runs them in parallel. That's the whole point —
you'll converge their results afterward
([Review, converge & merge](./05-review-converge-merge.md)).

Next: [Review, converge & merge](./05-review-converge-merge.md).
