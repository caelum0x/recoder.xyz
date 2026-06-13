# Recoder Agent OS

Recoder should act as the control plane for agents, not as a better prompt box.

## Core Thesis

Recoder owns the operational layer around agent work:

- identity
- capabilities
- task state
- permissions
- workflow routing
- approval gates
- verification
- artifacts
- memory provenance
- PR, preview, and handoff history

Claude Code, Codex, Recoder Code, browser agents, and other runtimes are execution surfaces.

## Operating Model

The default product loop should be:

1. Human provides high-level task intent.
2. Recoder turns that into a structured task spec.
3. Recoder compiles a runtime-specific instruction bundle.
4. A runtime claims and executes the task under policy.
5. Verification runs automatically.
6. Artifacts, approvals, preview links, and handoff state are stored.
7. Memory candidates are proposed with evidence for later reuse.

Manual prompt writing is a fallback, not the product.

## Instruction Spine

The repo-wide instruction hierarchy is:

- `AGENTS.md`: canonical cross-agent policy
- `CLAUDE.md`: imports `@AGENTS.md` and adds Claude-specific rules
- `.codex/AGENTS.md`: points to `../AGENTS.md` and adds Codex-specific rules
- deeper path-scoped instruction files: additive rules for local subtrees

This keeps the shared policy obvious while letting each runtime add small, local behavior.

## Instruction Bundle Direction

Recoder should compile task intent into an auditable artifact that includes:

- shared goal
- runtime-specific instructions
- instruction source references
- acceptance criteria
- verification commands
- forbidden actions
- approval gates
- memory references
- provenance metadata

That bundle becomes the source of truth for what an agent was told, what it was allowed to do, and how success was verified.

## Memory Model

Memory should be reviewable operational knowledge, not invisible state.

Expected flow:

1. A run finishes.
2. The agent proposes a memory candidate.
3. Recoder validates the evidence source.
4. Policy, PM, or a human approves it.
5. The approved memory becomes available to future instruction bundles.

## Delivery Principles

- Prefer task specs and policies over repeated prompt text.
- Keep policy enforcement deterministic through hooks and validators.
- Make approvals first-class workflow states.
- Store enough provenance to audit every run.
- Fail safe and report truthful health.

The instruction spine (canonical `AGENTS.md`, `CLAUDE.md` import contract,
`.codex/AGENTS.md` override, and the drift-guard validator) is in place; verify
with `pnpm agent:instructions:check`.
