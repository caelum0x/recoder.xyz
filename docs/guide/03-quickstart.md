# Quickstart: your first parallel run

This walks through the core loop end to end: run **two agents on the same task**,
compare them, converge, and land one governed merge. Budget ~10 minutes.

## Before you start

- Install Recoder ([Install](./02-install.md)).
- Have at least two agent CLIs on your `PATH` (e.g. Claude Code and Codex), each
  authenticated the way you normally use them
  ([Connect your coding agents](./04-connect-agents.md)).
- Have a local git repository you want to work in.

## 1. Create a workspace

Open the **Workspaces** hub (the default view). Use the launch panel to:

1. **Pick a repository** — choose the local folder for your git repo. Recoder
   checks it's a git repo (and can `git init` for you if not).
2. **Describe the task** — a short instruction, e.g. *"Add input validation to the
   signup form and cover it with tests."*
3. **Select the agents** — check two or more detected agents (say Claude Code and
   Codex). Agents that aren't installed/authenticated show their state so you're
   never guessing.
4. **Launch.**

Recoder creates **one isolated git worktree per agent**, all sharing the same task
group, and starts each agent in its own worktree. They run in parallel and never
touch each other's files.

## 2. Watch the runs

Each run streams its activity. Open a run to see its event stream (what the agent
is doing, files it's touching, when it needs input or hits an approval). You can
also attach a real terminal to a run's session if you want the raw agent TUI.

If an agent needs a decision that policy gates (e.g. a risky action), it surfaces
as an **approval** — see [Governance & approvals](./06-governance-and-approvals.md).

## 3. Compare the results

When the agents finish, open **Compare**. Recoder shows:

- each agent's diff side by side,
- which files are **contested** (more than one agent changed them),
- readiness / mergeability signals per run.

This is where you see, at a glance, where the agents agreed and where they went
different directions.

## 4. Converge

Open **Converge**. For every file:

- **Non-contested files** are taken automatically.
- **Contested files** you resolve — either **pick** one agent's version
  wholesale, or **synthesize** (merge non-overlapping edits from several agents via
  a 3-way merge). If a true line-level conflict exists, Recoder surfaces it rather
  than writing a broken merge.

Converge composes the winners into a **fresh governed branch** — it doesn't mutate
any agent's worktree.

## 5. Merge (governed)

Land the converged branch. The merge passes the **governance gate**:

- if policy allows it outright, it merges;
- if policy requires human sign-off, it waits for your **approval**;
- either way, it's sealed into the **audit chain** and a **ConvergenceEvidence**
  record is produced (content-hashed, and signed when a signing key is configured).

You now have one reviewed, governed commit that combines the best of the parallel
runs — plus a record proving how it got there.

## What you just produced

- A single merge combining N agents' work.
- A **ConvergenceEvidence** record: the task, each candidate diff, the governance
  verdict/approval, verification results, and per-file provenance (which agent won
  each path, pick or synthesize).
- An entry in the tamper-evident **audit trail**, exportable as a compliance pack.

Next: [Connect your coding agents](./04-connect-agents.md), or dive into
[Review, converge & merge](./05-review-converge-merge.md).
