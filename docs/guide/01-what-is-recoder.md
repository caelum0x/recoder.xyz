# What is Recoder?

Recoder is a desktop **agent control plane**. The product is a terminal: you open
Recoder, run your chosen coding agents in parallel isolated git worktrees, then
review and merge their work — with governance and a full audit trail underneath.

## The problem it solves

A single AI coding agent gives you one attempt at a task. If you want a second
opinion, you run it again and lose the first. If you run several agents at once,
you're left with N divergent branches and no principled way to combine them.

Recoder turns **N divergent parallel runs into one trusted merge**:

```
        ┌─ Claude Code ─→ worktree A ─┐
task ───┼─ Codex ───────→ worktree B ─┼──→ compare ──→ converge ──→ governed merge
        └─ opencode ────→ worktree C ─┘                                   │
                                                                          ▼
                                                            signed ConvergenceEvidence
                                                            + tamper-evident audit trail
```

- **Parallel, isolated.** Each agent works in its own git worktree. They never
  step on each other.
- **Compare.** See where the agents agree, where they diverge, and which files
  are contested.
- **Converge.** For each file, take one agent's version wholesale (*pick*) or
  merge non-overlapping edits from several (*synthesize*).
- **Govern.** Every merge passes a policy gate, can require human approval, and is
  sealed into a tamper-evident audit chain with signed evidence you can export for
  SOC 2 / EU AI Act / DORA reviews.

## Who it's for

- **Individual developers** who want to run a few agents against a task and keep
  the best result, fast.
- **Teams** who need parallel agents *and* a record of what happened — who changed
  what, which policy allowed it, and proof it was reviewed.
- **Regulated / enterprise** environments that need agent work to be governed and
  auditable, self-hosted, with no vendor cloud in the loop.

## What makes it different

| | Single-agent tools | Recoder |
|---|---|---|
| Agents | One vendor's agent | **Any** agent (Claude Code, Codex, opencode, …), in parallel |
| Result | One attempt | **Converged** best-of-N |
| Trust | Take it on faith | **Governed merge + signed evidence + audit trail** |
| Hosting | Cloud-coupled | **Self-hosted**, offline-capable |
| Keys | Often proxied/resold | **BYOK** — your keys, never proxied |

## What it is not

- It is **not** an editor. Recoder doesn't replace your IDE or add tab-completion;
  it drives the agent CLIs you already run and helps you converge their output.
- It is **not** a token reseller. You bring your own provider keys; Recoder
  orchestrates and never resells inference.

Next: [Install](./02-install.md).
