# Recoder Agent Instructions

This file is the canonical cross-agent policy for this repo. Runtime-specific files may add narrow behavior, but they should extend this file instead of duplicating it:

- `CLAUDE.md` imports this file for Claude Code.
- `.codex/AGENTS.md` points back to this file for Codex.
- Deeper `AGENTS.md` or `CLAUDE.md` files may add path-scoped rules for a subtree.

## Issue Tracking

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

### Quick Reference

```bash
bd ready --json
bd show <id> --json
bd update <id> --claim --json
bd close <id> --reason "Completed" --json
bd vc status
```

## Non-Interactive Shell Commands

Always use non-interactive flags with file operations.

```bash
cp -f source dest
mv -f source dest
rm -f file
rm -rf directory
cp -rf source dest
scp -o BatchMode=yes ...
ssh -o BatchMode=yes ...
apt-get -y ...
HOMEBREW_NO_AUTO_UPDATE=1 brew ...
```

## Issue Tracking with bd

Use `bd` for all task tracking in this repo.

- Check ready work with `bd ready --json`.
- Claim work atomically with `bd update <id> --claim --json`.
- Link newly discovered work with `--deps discovered-from:<parent-id>`.
- Do not create markdown TODO trackers or use external issue trackers.

## Agent OS Model

Recoder should behave like an agent control plane, not a prompt library.

- Humans provide task intent, scope, constraints, verification, and approval requirements.
- Recoder compiles that input into runtime-specific instruction bundles.
- Claude Code, Codex, Recoder Code, browser agents, and future runtimes are execution surfaces.
- Every meaningful run should end with verification, artifacts, and an audit trail.
- Durable memory must be reviewable and evidence-backed, not silent runtime state.

## Runtime Overlays

- `CLAUDE.md`: Claude-specific behavior only. It must import `@AGENTS.md`.
- `.codex/AGENTS.md`: Codex-specific overrides only. It must point back to `../AGENTS.md`.
- Path-scoped instruction files should stay local, additive, and short.

## Project Snapshot

- Monorepo for the Recoder platform (`recoder.xyz`) with multiple deployed surfaces.
- Main production surfaces:
  - `app/` -> `https://recoder.xyz`
  - `recoder-agents/` -> `https://agents.recoder.xyz`
  - `recoder-agency/` -> `https://agency.recoder.xyz`
  - `recoder-pm/` -> `https://pm.recoder.xyz`
  - `recoder-web/` -> `https://web.recoder.xyz`
  - `docker-backend/` for service runtime and agent orchestration

## Core Engineering Philosophy

- Less is more. Keep implementations small and obvious.
- Prefer simple data structures and explicit control flow.
- Minimize dependencies and abstractions unless they clearly pay for themselves.
- Fail fast, surface truthful health, and never fake success.
- Prefer task specs, policies, hooks, and verification over repeated manual prompting.
- Preserve scoped instruction files that carry local rules; do not replace them with global prompt text.

## Critical Architecture Rules

1. `recoder.xyz` is the auth source of truth.
2. Keep `user` and `users` as separate models.
3. Validate cross-subdomain auth behavior with scripts before claiming completion.
4. Never hardcode localhost for production links or callbacks.
5. Billing and runtime health must fail safe when keys or dependencies are missing.
6. Memory updates must be proposed with evidence before they become durable defaults.

## Working Rules for Agents

1. Start from a task spec when possible: goal, scope, constraints, verification, approvals, artifacts.
2. Prefer compiled instruction bundles and repeatable skills over ad hoc long prompts.
3. Keep write scope narrow. Avoid concurrent write-heavy agents on the same files.
4. Treat forbidden paths, auth, billing, and security-sensitive files as approval-gated unless the task says otherwise.
5. Produce artifacts that let another agent or human audit what happened.
6. When tools exist for hooks, memory, approvals, or A2A messaging, use them instead of inventing side channels.

## Verification Defaults

Use the narrowest checks that prove the touched behavior. Prefer existing repo scripts when relevant.

Common verification entry points:

- `pnpm format`
- `pnpm check-types`
- `pnpm test`
- `scripts/verify-phase14-runtime.sh`
- `scripts/sso-logout-matrix.sh`
- `scripts/verify-auth-email-reset-e2e.sh`
- `scripts/verify-byok-e2e.sh`
- `scripts/verify-cli-device-flow-e2e.sh`
- `scripts/production-external-closeout.sh`

## Coordination Surfaces

- When A2A inbox tools are available, check for pending work before starting new work.
- When gstack `/browse` is available, prefer it over ad hoc browser integrations.
- Use runtime-specific hooks for deterministic policy enforcement, artifact capture, and delivery summaries.

## Landing The Plane

When ending a work session with code changes:

1. File follow-up `bd` issues for remaining work.
2. Run the relevant quality gates.
3. Update and close the claimed `bd` issue when done.
4. `git pull --rebase`
5. `bd vc status`
6. `git push`
7. Verify `git status` shows the branch is up to date with origin.

Do not stop before the work is committed and pushed.
