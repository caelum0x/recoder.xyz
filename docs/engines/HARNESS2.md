# Harness² integration status: additive capability probe, not a selectable engine

**Status: evaluated 2026-10-19. Not wired as a `ConductorRuntime`/driver.**
A small, additive, optional capability probe ships instead:
`mcp/recoder-harness2-adapter.js` (+ `mcp/recoder-harness2-adapter/`
manifest/README).

## What Harness² is

[Harness²](https://github.com/google-research/harness2) ("Recursive Agent
Harnessing for an Open World", Google Research, Apache 2.0, released
2026-10-09, [paper](https://arxiv.org/pdf/2610.14224)) is a framework for
letting a coding agent rewrite its own scaffolding at runtime, without
touching model weights. It exposes **8 editable harness components**: system
prompt, guardrails, memory, tool guidance, subagents, skills, scripts, and
plugins.

It runs two nested loops, both built on top of an OpenCode or Codex
*executor*:

- **Task-level recursion** — a contrastive Propose → Probe → Compose step:
  propose edits to the harness, probe their effect by re-running the *same*
  task, and compose a refined harness from the behavioral contrast between
  runs (no ground-truth feedback needed).
- **Harnessing-level recursion** — after a task, an "experience reflector"
  folds adopted harnesses and evidence-backed lessons into a persistent
  *improvement harness* that seeds future tasks.

It reports real gains on three benchmarks (JobBench, LAB, WorkBuddy-Bench)
across GLM-5 and Gemini 3.5 Flash.

## What a Recoder user gets if this were wired as an engine

In principle: a selectable engine where Recoder hands off a task the same way
it does to Codex or Claude Code, except the agent can also improve its own
system prompt / tools / subagents / skills mid-task and carry the
improvement forward — additive and optional, never replacing Recoder's own
engines.

## Why that integration is genuinely blocked today

This is based on reading the actual released repository
(`git clone --depth 1 https://github.com/google-research/harness2`,
commit as of 2026-10-19), not the press description. Evidence:

1. **The CLI has no arbitrary-task mode.** `pyproject.toml` registers:

   ```toml
   [project.scripts]
   harness2 = "harness2.cli.run_sweep:main"
   harness2-judge = "harness2.cli.judge:main"
   harness2-report = "harness2.cli.report:main"
   harness2-setup = "harness2.cli.setup:main"
   harness2-check = "harness2.cli.check:main"
   ```

   `run_sweep.py`'s parser requires `--bench` from a **closed choice set**:
   `p.add_argument("--bench", required=True, choices=BENCHES, help="jb | wb | lab")`.
   There is no `--repo`, `--prompt`, or `--task-file` flag anywhere in the
   CLI surface (`harness2/cli/*.py`). You cannot point `harness2` at an
   arbitrary git repository and an arbitrary task description.

2. **The executor interface is benchmark-coupled by construction.**
   `harness2/substrate/base.py` defines the `Substrate` protocol every
   executor (OpenCode, Codex) implements:

   ```python
   def execute(
       self, task_ref: str, install: Install, run_ids: list[str], timeout: int
   ) -> list[Path]:
       """Run rollouts via the benchmark-supplied launcher; one run_dir per run_id."""
   ```

   The docstring is explicit: the `Launcher` (a `Callable[[RunRequest,
   Install], list[Path]]`) is **"benchmark-supplied"**, meaning it comes from
   `third_party/{jb,lab,wb}_runner` — each a vendored upstream benchmark
   runner with its own Docker/venv sandbox and pre-downloaded task dataset.
   `task_ref` is a benchmark task ID that only resolves inside that dataset.
   There is no `execute(prompt, workdir)` path for an arbitrary Recoder
   workspace.

3. **A model-backed run needs infra Recoder's other adapters don't need.**
   Per `docs/SETUP.md`: Linux, Python 3.12, `uv`, Node.js 20+, the **Google
   Cloud CLI with Vertex AI Application Default Credentials**
   (`gcloud auth application-default login`), benchmark-pinned Python venvs
   under `dependencies/<bench>/.venv`, and (for WorkBuddy-Bench) **Docker**
   with permission to run `docker info`. Recoder's Codex/Claude adapters, by
   contrast, just shell out to a CLI the user has already installed and
   authenticated (`codex`, `claude`) — no cloud project, no ADC, no
   benchmark-specific venvs.

4. **Harness² consumes Codex/OpenCode; it is not designed to be consumed.**
   Its own "Codex executor" talks to a Responses API endpoint through
   `harness2-bridge`, a local LiteLLM server that translates the same Vertex
   ADC credentials into that endpoint (`docs/SETUP.md#codex-executor`).
   Harness² is the orchestrator in every documented flow; nothing in the
   released API lets an external system (Recoder) hand Harness² a task the
   way Harness² hands a task to Codex.

## Why we didn't force it

Faking a `ConductorRuntime`/driver entry for `harness2` in
`packages/runtime/src/registry/builtin-drivers.ts` or
`backend/src/domains/interop-wire/runtimes/` would mean one of:

- A registry entry that is **permanently non-functional** — exactly the
  "dead file" / fake-integration outcome this task was told to avoid, and a
  direct violation of this repo's own truthful-health rule (`AGENTS.md`:
  "Fail fast, surface truthful health, and never fake success";
  `.claude/rules/frontend.md`: "show the missing source clearly instead of
  faking success"), or
- Recoder building its **own** benchmark-style `Launcher` + judge so an
  arbitrary Recoder task can masquerade as a Harness² "benchmark task" —
  which is explicitly out of scope ("not a reimplementation of Harness²'s
  self-editing logic") and, based on `harness2/core/recursion.py` (578
  lines), `schedule.py` (850 lines), and `spec.py` (277 lines), a multi-week
  project requiring its own Docker sandboxing, Vertex AI judge wiring, and
  task-ref resolution — not something a single adapter task can responsibly
  ship and verify.

## What ships instead

`mcp/recoder-harness2-adapter.js` — a read-only, additive capability probe
over the same JSON-RPC-over-stdio shape as `recoder-codex-adapter.js`:

- `harness2_health` — checks whether `harness2`, `harness2-check`, `uv`,
  `gcloud`, `docker`, and `node` are actually present on `PATH` (never
  reports "ready" without verifying), and always reports
  `supportsTaskDispatch: false` with the reason above.
- `harness2_describe` — a static, accurate summary of what Harness² is and
  why it isn't dispatchable, so any caller that introspects this adapter
  gets the truth instead of assuming it's a full coding engine.

This is **not** registered in `packages/runtime`'s driver registry or the
`interop-wire` runtime registry, and does not appear as a selectable engine
in any Recoder UI. It exists purely so an operator or agent can ask "is a
Harness² benchmark environment usable here, and what is it actually for"
without Recoder claiming a capability it does not have.

## What a real integration would require (future work, not done here)

If this is revisited later, the honest path is: implement a Recoder-owned
`Substrate`-compatible `Launcher` (library-level, importing `harness2.core`
and `harness2.substrate` directly rather than the benchmark CLI) that maps a
Recoder `TaskSpec` + git worktree to a one-off `task_ref`, and a judge
suitable for non-benchmark tasks. That needs Python 3.12/`uv`, Vertex AI ADC
(or another judge/improver model route), and is a standalone project on the
order of the existing `third_party/{jb,lab,wb}_runner` integrations — it is
not an "adapter file."
