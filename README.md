# Recoder

> **N agents in parallel. One trusted merge.**

Recoder is a **self-hosted desktop app for running your own AI coding agents in parallel** — Claude Code, Codex, Cursor, opencode — each in an isolated git worktree. You compare their diffs, converge the best result, and merge it through a governed, human-approvable gate that produces a **signed evidence record**. Your infrastructure, your keys, your code.

[Website](https://recoder.xyz) · [Download](https://recoder.xyz/download) · [Self-host](https://recoder.xyz/self-host) · [Docs](docs/README.md)

---

## Why Recoder

Running one AI agent gives you one attempt. Running several in parallel gives you options — but then you're stuck manually diffing branches and hoping you pick the right one. Recoder turns **N divergent agent runs into one trusted, shippable change**:

1. **Run N agents in parallel** — each in its own isolated git worktree, so they never step on each other. Mix different agents (Claude Code, Codex, Cursor, opencode) on the same task.
2. **Compare & converge** — see every agent's diff side by side; converge the winners (auto for non-contested files, your pick for contested ones) into a fresh branch.
3. **Governed, evidence-producing merge** — every merge passes an approval gate and emits a content-hashed `ConvergenceEvidence` record (the task, the candidate diffs, the verdict, the verification), sealed into a tamper-evident audit chain and Ed25519-signable — with an export pack mapped to SOC 2 / EU AI Act / DORA controls.

The terminal stays as plain as a terminal. Governance is an in-flow gate and an exportable evidence file — not a dashboard.

## What you get

- **Parallel agent workspaces** over isolated git worktrees (local tmux, ACP, or remote/cloud substrates)
- **Live diff review** — whole-diff, per-file, single-file patch
- **N→1 convergence** — compare N runs and merge the best, with 3-way synthesis for same-file edits
- **A governance gate on every write** — decide → audit; a denied action never reaches git or your remote
- **Signed convergence evidence** + framework-mapped compliance export
- **Shared memory + code-intelligence** enrichment across runs
- **Self-hosted & BYOK** — runs on infrastructure you own, with your own model keys; local agents run without an account

## Getting started

Recoder is a desktop app. Grab a build from **[recoder.xyz/download](https://recoder.xyz/download)**, or run it on your own infrastructure — see **[recoder.xyz/self-host](https://recoder.xyz/self-host)** and the [architecture docs](docs/RECODER-ARCHITECTURE.md).

Once it's open:

1. Point Recoder at a git repo and describe a task.
2. Launch two or more agents on it — they run in parallel worktrees.
3. Review the diffs, converge the best, and merge through the gate.

Local agents run offline without an account; sign in (optional, Google/GitHub) to sync memory and PRs.

### Try it now: the `recoder-code` CLI

Don't want to wait for the desktop app? **[`recoder-code`](https://www.npmjs.com/package/recoder-code)** is the same BYOK coding-agent idea, published and working on npm today — no desktop install, no waitlist:

```bash
npx recoder-code@latest
```

It includes a parallel mode that mirrors the desktop app's git-worktree-per-agent pattern, from the terminal:

```bash
npx recoder-code@latest parallel "implement user auth"   # start a parallel task on a new branch
npx recoder-code@latest parallel --list                  # list active parallel worktrees
npx recoder-code@latest parallel-finish                  # finish parallel mode and commit changes
```

Every command above is verified against the live, published package (`npx recoder-code@latest --help`); see **[recoder.xyz/docs/cli](https://recoder.xyz/docs/cli)** for the full, current command reference.

## Plans

| Plan | Price | For |
|---|---|---|
| **Free** | $0 | Try the full loop with a capped monthly allowance |
| **Weekly** | $10 / week | Flexible, low-commitment access with all models |
| **Pro / Team** | monthly | Higher quotas + team features |
| **Enterprise** | custom | Negotiated — SSO, isolation, support |

Billing runs through **Creem** (Merchant of Record). See **[recoder.xyz/pricing](https://recoder.xyz/pricing)** for current tiers.

## Documentation

Start at **[docs/README.md](docs/README.md)**. Highlights:

- [PRODUCT-THESIS.md](docs/PRODUCT-THESIS.md) — the convergence thesis + locked product decisions
- [RECODER-ARCHITECTURE.md](docs/RECODER-ARCHITECTURE.md) — the layer stack + engine→module map
- [RECODER-PRODUCT-DESIGN.md](docs/RECODER-PRODUCT-DESIGN.md) — design principles: clean-first, backend/frontend split
- [SECURITY-POSTURE.md](docs/SECURITY-POSTURE.md) — honest, code-grounded security posture
- [RECODER-MODULES.md](docs/RECODER-MODULES.md) — the backend capabilities agents use (behind the governance gate)

## Security

Security is enforced **below the model** — hooks, policy gates, signed envelopes, and server-side validation, never trusting agent output or runtime-reported success. The cross-tenant isolation surface is owner-bound and the moat has been through an adversarial defect sweep; the current, honest posture (fixed vs. residual) lives in [SECURITY-POSTURE.md](docs/SECURITY-POSTURE.md). Found something? Email **contact@recoder.xyz**.

## Status

Recoder is a real, actively-developed product: the full run → converge → governed-merge loop works end-to-end, and the backend, website, and desktop test suites are green. The current, code-grounded state lives in the [docs index](docs/README.md); the before-multi-tenant-launch checklist is in [SECURITY-POSTURE.md](docs/SECURITY-POSTURE.md).

## License & attribution

© 2026 Recoder. All rights reserved. Recoder builds on excellent open-source projects (including a fork of Wave Terminal and other vendored engines); their upstream licenses and attributions are retained in-tree.

---

[Website](https://recoder.xyz) · [Docs](docs/README.md) · [GitHub](https://github.com/caelum0x/recoder.xyz) · contact@recoder.xyz
