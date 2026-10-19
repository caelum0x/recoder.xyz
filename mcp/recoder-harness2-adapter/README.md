# Recoder Harness² Probe

The live entrypoint is `mcp/recoder-harness2-adapter.js`.

This folder documents the package boundary for Google Research's
[Harness²](https://github.com/google-research/harness2) (Apache 2.0, released
2026-10-09) and this integration's real scope. Full writeup:
[`docs/engines/HARNESS2.md`](../../docs/engines/HARNESS2.md).

## Why this is a probe, not a `ConductorRuntime`

`mcp/recoder-codex-adapter.js` and `mcp/recoder-claude-bridge` work because
Codex and Claude Code both expose a stable "run an arbitrary prompt against an
arbitrary repo, stream back edits" surface. Harness², as released, does not:

- Its only CLI entrypoint (`harness2`) takes `--bench {jb,lab,wb}` — a closed
  set of three research benchmarks, not an arbitrary task or repo.
- `Substrate.execute()` requires a benchmark-supplied launcher
  (`third_party/{jb,lab,wb}_runner`) and a `task_ref` that only resolves
  inside that benchmark's fixed, pre-downloaded dataset.
- A model-backed run needs Linux + Python 3.12 + `uv` + Google Cloud CLI with
  Vertex AI Application Default Credentials, benchmark-pinned venvs, and (for
  WorkBuddy-Bench) Docker — none of which Recoder's existing adapters need.
- Harness² is itself a *consumer* of Codex/OpenCode (via its own
  `harness2-bridge` LiteLLM shim for the Codex path), not something designed
  to be consumed as an executor.

Wiring Harness² into `packages/runtime/src/registry/builtin-drivers.ts` or
`backend/src/domains/interop-wire/runtimes/` as a selectable
`ConductorRuntime` would therefore either be permanently non-functional (a
dead, misleading registry entry) or require Recoder to build its own
benchmark-style `Launcher` + judge — out of scope for an adapter and
explicitly not what this task asked for ("not a reimplementation of
Harness²'s self-editing logic").

## What this adapter actually provides

Two read-only JSON-RPC tools, over the same stdio shape as the other `mcp/`
adapters:

- `harness2_health` — truthful local dependency probe (`harness2`,
  `harness2-check`, `uv`, `gcloud`, `docker`, `node`). Never reports "ready"
  for something unverified.
- `harness2_describe` — static, accurate description of what Harness² is,
  what it supports, and why it is not dispatchable, so any caller
  (including a Recoder agent) that introspects this adapter gets the truth
  instead of assuming it is a full coding engine.

There is no `harness2_run_task`-style tool. Adding one would be a fake
capability.

## Environment

No credentials required for `harness2_health` / `harness2_describe` — both
are local, read-only checks. Running Harness²'s own benchmarks (outside of
Recoder) follows the upstream [SETUP.md](https://github.com/google-research/harness2/blob/main/docs/SETUP.md).

Do not move the existing JS entrypoint without updating consumers.
