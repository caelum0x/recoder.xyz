# Review, converge & merge

This is Recoder's headline flow: take N parallel agent runs and turn them into one
reviewed, governed commit.

## The three steps

```
Compare ──→ Converge ──→ Governed merge
(see diffs) (resolve per-file) (policy + approval + evidence)
```

## 1. Compare

Open **Compare** for a task group. You get:

- **Side-by-side diffs** of each agent's worktree against the base.
- **Contested files** — paths that more than one agent changed. These are where
  you make decisions; everything else can flow through automatically.
- **Readiness / mergeability** signals so you know which runs are actually landable.
- **Pairwise A/B** comparison when you want to weigh two agents head-to-head.

## 2. Converge

Open **Converge**. Recoder builds a convergence plan:

- **Non-contested files** are taken automatically from whichever agent changed
  them.
- **Contested files** you resolve, per file, one of two ways:
  - **Pick** — take one agent's version of the file wholesale. Safe and obvious
    when one agent clearly did it right.
  - **Synthesize** — merge non-overlapping edits from multiple agents using a
    3-way merge (`git merge-file` semantics; for more than two agents it folds
    them pairwise). If two agents edited the **same lines** in a way that truly
    conflicts, Recoder marks it a conflict and **aborts that file rather than
    writing conflict markers** — you won't get a silently broken merge.

Converge **composes the winners into a fresh branch**. It never mutates the
agents' worktrees, so you can always go back and re-converge differently.

> **Provenance is recorded.** For every file, Recoder remembers which agent won
> and whether it was a pick or a synthesize. That provenance goes into the
> evidence record (below).

## 3. Governed merge

Land the converged branch. Before any git write happens, the merge passes the
**governance gate**:

- **Allowed** → it merges (falling back to a local `git merge` when there's no
  remote/`gh`, e.g. the desktop case).
- **Needs approval** → it waits for a human decision
  ([Governance & approvals](./06-governance-and-approvals.md)).
- **Denied** → it stops and tells you why.

Every outcome is sealed into the **tamper-evident audit chain**.

## The evidence you get

A successful governed merge produces a **ConvergenceEvidence** record containing:

- the task and each candidate agent's diff,
- the governance verdict and any approval,
- verification results (readiness / checks),
- **per-file provenance** — which agent contributed each path, pick vs synthesize,
- a SHA-256 **content hash**, and an **Ed25519 signature** when a signing key is
  configured (the app verifies the signature in-place and shows `✓ verified` /
  `signed` / `unsigned` truthfully).

You can view it on the Review surface and **export a compliance pack** mapping the
evidence to a control catalog (SOC 2, EU AI Act, DORA, and Recoder's own
convergence-integrity control). Each control's status is **derived from the actual
evidence** — never marked "met" without backing. See
[Governance & approvals](./06-governance-and-approvals.md#compliance-evidence-export).

Next: [Governance & approvals](./06-governance-and-approvals.md).
