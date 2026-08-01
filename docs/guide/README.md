# Recoder User Guide

Recoder is a **self-hosted convergence layer** for AI coding agents. You run your
own agents — Claude Code, Codex, opencode, and more — **in parallel, in isolated
git worktrees**, then compare their work, converge the best of each, and land a
single **governed, evidence-producing merge**. Your machine, your agents, your
keys. Recoder orchestrates; it never proxies or resells tokens.

This guide is task-oriented. Start at the top and work down, or jump to what you
need.

## Getting started

1. [What is Recoder?](./01-what-is-recoder.md) — the idea, who it's for, how it
   differs from a single-agent tool.
2. [Install](./02-install.md) — download the signed desktop app, first run, and
   what the app starts on your machine.
3. [Quickstart: your first parallel run](./03-quickstart.md) — create a workspace,
   launch two agents on the same task, review, converge, merge.

## Using Recoder

4. [Connect your coding agents](./04-connect-agents.md) — Claude Code, Codex,
   opencode, Cursor, Gemini CLI, and others. How detection and auth work.
5. [Review, converge & merge](./05-review-converge-merge.md) — compare N agent
   runs, pick or synthesize per file, and land one governed merge.
6. [Governance & approvals](./06-governance-and-approvals.md) — the policy gate,
   approval prompts, the tamper-evident audit trail, and compliance evidence.
7. [Bring your own keys (BYOK)](./07-byok-and-keys.md) — point Recoder at the
   provider keys your agents already use. Recoder never proxies tokens.

## Help

8. [Troubleshooting](./08-troubleshooting.md) — backend not connected, an agent
   isn't detected, engine health, and other degrade states.

---

> **Truthfulness note.** Recoder is built to never fake success. If a dependency
> is missing (a provider key, an agent CLI, an optional engine), the relevant
> surface degrades **visibly** — it tells you what's missing rather than pretending
> it worked. Throughout this guide, "degrades truthfully" means exactly that.
