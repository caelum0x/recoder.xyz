# Bring your own keys (BYOK)

Recoder is **bring-your-own-keys**. You point it at the provider keys your agents
already use. Recoder orchestrates and governs; **it never proxies, intercepts, or
resells inference tokens**. You pay your providers directly for inference, and (if
you're on a paid Recoder plan) you pay Recoder for orchestration and control —
never for tokens.

## Two places keys are used

There are two distinct paths, and it helps to keep them separate:

### 1. Your agents' own keys

When you run Claude Code, Codex, opencode, etc., **the agent talks to its provider
using its own auth** — exactly as it does when you run it outside Recoder. Recoder
launches each agent with your shell environment, so it inherits the same keys and
config you normally use:

- `ANTHROPIC_API_KEY` for Claude Code,
- `OPENAI_API_KEY` for Codex,
- whatever provider/key opencode and the others are configured with.

Recoder does not sit between the agent and its provider. It doesn't see or store
those tokens beyond passing your environment through to the agent process.

### 2. Recoder-managed inference (optional)

Some Recoder features can call an LLM directly (for example, assistive features and
routing). These go through Recoder's **BYOK LLM gateway**, which you configure with
your own provider keys. Missing keys **degrade truthfully** — the feature reports
it's unavailable rather than silently failing or falling back to someone else's
tokens. Key writes are governed (they pass the governance gate), and secrets are
stored encrypted, never in plaintext.

## Recoder platform keys vs provider keys

Don't confuse the two:

- **Provider keys** (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …) — your AI provider
  credentials. These pay for inference. Recoder never resells these.
- **Recoder platform keys** (`sk_…`) — identify you to a Recoder backend for
  control-plane operations. The desktop app mints one locally for its embedded
  backend; you don't need to manage it by hand for local use.

## Setting keys

- **For your agents:** set the provider keys in your shell the way each agent's
  docs describe (e.g. export `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in your shell
  profile). Then launch Recoder so it inherits them; agents will show as
  authenticated once their auth is present.
- **For Recoder-managed inference:** add your provider keys through Recoder's
  settings/inference configuration. They're stored encrypted and used only for
  Recoder's own gateway calls.

## Privacy posture

- Local-first: the control plane runs on your machine (loopback only).
- Your code and diffs stay on your machine unless you explicitly turn on team
  features.
- Recoder never proxies your agents' provider traffic.

Next: [Troubleshooting](./08-troubleshooting.md).
