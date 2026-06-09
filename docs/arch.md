I checked your Recoder GitHub index and the current official Claude Code/Codex docs. My read: Recoder should not become “a better prompt app.” Recoder should become the control plane that writes, routes, verifies, remembers, and audits prompts on behalf of agents.
Your repo is already halfway there.
Core thesis
Build Recoder Agent OS.
Recoder owns:
	•	agent identity
	•	capabilities
	•	task state
	•	permissions
	•	memory provenance
	•	workflow routing
	•	approval gates
	•	verification
	•	artifacts
	•	PR/preview/client handoff history
Claude Code, Codex, Recoder Code, OpenCode, Qwen Code, Gemini CLI, E2B, Daytona, browser agents, and future desktop agents are runtimes.
Prompts become compiled artifacts.
Humans should not hand-write long prompts repeatedly. Humans should create high-level task intent. Recoder should compile that into the right Claude/Codex/agent-specific instruction bundle, run it, verify it, and update memory.
That matches where Claude Code and Codex are going. Claude Code’s official docs center persistent project instructions, auto memory, skills, hooks, MCP, and agent teams/subagents. The key mechanism is not “manual prompt harder,” it is “put recurring knowledge into CLAUDE.md, memory, skills, hooks, and subagents.” (Claude API Docs) Codex still uses prompts, but its docs say quality depends on clear goals, repro steps, verification commands, scoped tasks, AGENTS.md, hooks, and subagents. That means Recoder should generate better task specs and verification loops, not ask users to become prompt engineers. (OpenAI Developers)
What I found in your repo
The installed GitHub entry for caelum0x/recoder.xyz is a private monorepo on main, and it is much larger than the split recoder-code and recoder-web repos, so it should be treated as the main platform repo.
You already merged a serious “agent capability layer” on June 2, 2026. That commit says Recoder now exposes capabilities via GET /api/capabilities, adds Qwen Code and Gemini CLI adapters, E2B, mem0, Context7, OpenZiti, a 12-provider LLM router, GitNexus-style code intelligence, multica skill profiles, and /capabilities plus /workflows UI surfaces. It also states the design principle I would keep: fail-safe, truthful health, never fake success.
Your existing plan already says the right thing: “one workspace, many agents, controlled delivery.” It frames Recoder Spaces as the shared task room where humans, coding agents, PM agents, review agents, deployment agents, browser agents, and later desktop agents coordinate through tasks, artifacts, approvals, logs, and audit trails. It also says the control plane owns identity, workflow state, approval state, and orchestration history, while runners like Daytona remain execution substrates.
Your recoder-agency/AGENTS.md and recoder-agency/CLAUDE.md exist as scoped instruction docs. The agency guide’s philosophy is good: less is more, simple APIs, minimize dependencies, fail fast, explicit over implicit, and keep code obvious.
You already have the runtime pieces: a WebSocket A2A bridge for local agents, Claude connector routes/runtime, a Codex adapter, a Recoder A2A CLI server, production smoke scripts, and tools/a2a-interop.
The current Codex adapter exposes five tools: list agents, list tasks, send task, create thread, and sandbox run. That is enough for a proof, but not enough for production trust yet.
Your SDK docs still describe agents as having model, system_prompt, and tools, and workflows as directed graphs with nodes like agent, tool, condition, parallel, and approval. That is fine as an API, but the product should hide most raw prompt work behind task specs, policies, memory, and workflow nodes.
The big design correction
Do not build “Prompt Library 2.0.”
Build this:
Human intent
  ↓
Recoder Task Spec
  ↓
Instruction Compiler
  ↓
Agent routing + policy + memory + tools
  ↓
Claude Code / Codex / Recoder Code / other runtime
  ↓
Verification loop
  ↓
Artifacts, PRs, previews, approvals
  ↓
Memory update + audit history
Manual prompting becomes a fallback, not the core UX.
The user should say:
“Fix signup crash and make sure the preview works.”
Recoder should compile:
intent: bugfix
space_id: sp_...
repo: caelum0x/recoder.xyz
branch_policy: create_worktree_branch
target_paths:
  - app/**
  - backend/**
forbidden_paths:
  - .env*
  - secrets/**
acceptance:
  - signup no longer crashes
  - regression test added
  - preview URL responds
verify:
  - pnpm check-types
  - pnpm test
  - pnpm -F recoder-web build
  - browser_verify: /signup
approval_required:
  - before pushing PR
  - before touching billing/auth/security files
artifact_required:
  - summary
  - changed_files
  - test_output
  - preview_url
handoff:
  reviewer: pm_agent
  final_owner: human
Then Recoder translates that into Claude Code, Codex, or Recoder Code instructions with the right context and tool permissions.
Target architecture
1. Agent Identity and Capability Registry
Create one canonical AgentProfile.
This should live in packages/a2a-sdk or shared/a2a, not inside one UI.
export type AgentProfile = {
  agent_id: string;
  display_name: string;
  vendor_surface:
    | "recoder_code"
    | "claude_code"
    | "codex"
    | "opencode"
    | "qwen_code"
    | "gemini_cli"
    | "browser"
    | "custom";
  connector_id: string;
  runtime_kind: "local" | "sandbox" | "hosted" | "browser" | "external";
  capabilities: AgentCapability[];
  tools: ToolCapability[];
  supported_task_intents: TaskIntent[];
  permissions: AgentPermissionPolicy;
  approval_policy: ApprovalPolicy;
  memory_scope: "none" | "space" | "repo" | "user" | "org";
  cwd_policy: CwdPolicy;
  health: RuntimeHealth;
  last_seen_at: string;
};
This should be the single source of truth for “what can this agent do?” The existing bridge already tracks sessions, agent IDs, user IDs, workspaces, capabilities, status, and heartbeat, so this is a consolidation rather than a rewrite.
2. Instruction Fabric
This is the most important missing layer.
Create:
packages/agent-instructions/
  src/compiler.ts
  src/source-loader.ts
  src/claude-renderer.ts
  src/codex-renderer.ts
  src/recoder-code-renderer.ts
  src/provenance.ts
Inputs:
type InstructionCompileInput = {
  task: RecoderTaskSpec;
  agent: AgentProfile;
  repoContext: RepoContextManifest;
  spacePolicy: SpacePolicy;
  memory: MemorySnapshot[];
  pathRules: PathInstructionRule[];
  recentFailures: FailurePattern[];
  verification: VerificationPlan;
};
Output:
type InstructionBundle = {
  shared_goal: string;
  agent_specific_prompt: string;
  system_context_refs: InstructionSourceRef[];
  acceptance_criteria: string[];
  verification_commands: string[];
  forbidden_actions: string[];
  approval_gates: ApprovalGate[];
  memory_used: MemoryRef[];
  provenance: {
    source_files: Array<{ path: string; sha: string }>;
    compiled_at: string;
    compiler_version: string;
  };
};
This gives you “prompt itself” without asking humans to type prompts.
Every run should store the compiled instruction bundle as an artifact. That lets PM, Agency, and future audits answer:
	•	What did the agent know?
	•	Which rules were loaded?
	•	Which memory was used?
	•	Which files was it allowed to touch?
	•	What verification did it run?
	•	Who approved the risky step?
3. Canonical instruction file strategy
Use one root spine.
AGENTS.md                 # canonical cross-agent instructions
CLAUDE.md                 # imports AGENTS.md, Claude-specific behavior
.codex/AGENTS.md          # Codex-specific overrides only
.claude/skills/recoder/*  # repeatable workflows
docs/agent-os.md          # human-readable architecture
Claude Code officially reads CLAUDE.md, not AGENTS.md, and Anthropic recommends importing AGENTS.md from CLAUDE.md when a repo already uses AGENTS.md. Codex officially reads AGENTS.md, with deeper path-specific files overriding parent instructions. (Claude API Docs)
So do this:
<!-- CLAUDE.md -->
# Recoder Claude Code Instructions

@AGENTS.md

## Claude-specific rules

- Use Recoder skills before ad-hoc prompting.
- Prefer task specs and verification plans over open-ended implementation.
- Use subagents only for read-heavy analysis unless Recoder grants a write lock.
- Never update memory directly without producing a memory candidate artifact.
And this:
<!-- .codex/AGENTS.md -->
# Recoder Codex Instructions

Read ../AGENTS.md as the canonical policy.

Codex-specific rules:
- Always produce a plan for multi-file changes.
- Prefer read-only subagents for investigation.
- Do not run write-heavy parallel agents on the same files.
- Always run the verification commands from the Recoder task spec.
4. Runtime Adapter Contract
Right now Claude and Codex are close but not symmetric. Claude has connector routes. Codex has a JSON-RPC adapter. Put both behind one adapter interface.
export interface AgentRuntimeAdapter {
  id: string;
  platform: AgentProfile["vendor_surface"];

  capabilities(): Promise<AgentCapability[]>;
  health(): Promise<RuntimeHealth>;

  start?(input: RuntimeStartInput): Promise<RuntimeHandle>;
  sendTask(envelope: TaskEnvelope, bundle: InstructionBundle): AsyncIterable<RunEvent>;

  cancel(taskId: string): Promise<void>;
  approve?(approvalId: string, decision: ApprovalDecision): Promise<void>;
}
Claude connector routes already expose start, stop, restart, status, tools, execute, task status, cancellation, and approval handling. That should become the reference adapter surface, not a special-case Claude feature.
Codex should be upgraded from “five tools over JSON-RPC” into the same adapter contract. The current adapter proves the shape, but production needs auth, signed envelopes, structured errors, timeouts, and artifact streaming.
5. Workflow Orchestrator
Your workflow docs already support agent/tool/condition/parallel/approval nodes. The next step is to make these nodes execute against real A2A task envelopes and instruction bundles, not generic prompt strings. Approval nodes already exist conceptually in the docs, including pause/approve/reject behavior.
Use this lifecycle:
created
  -> compiled
  -> routed
  -> claimed
  -> running
  -> needs_input
  -> verifying
  -> waiting_for_approval
  -> approved
  -> delivered
  -> completed

failed, cancelled, rejected are terminal side paths.
Every transition writes an audit event.
6. Memory with review
Memory should not be invisible magic.
Claude Code supports auto memory, and Codex hooks can be used for persistent memories. But Recoder should treat memory as reviewable operational knowledge, not random notes. (Claude API Docs)
Memory update flow:
run finishes
  -> agent proposes memory candidate
  -> Recoder validates source evidence
  -> PM/human or policy approves
  -> memory writes to repo/space/user/org scope
  -> future instruction bundles cite memory ref
Example memory candidate:
{
  "scope": "repo",
  "title": "recoder-web build command",
  "body": "Use `pnpm -F recoder-web build` to validate production route builds.",
  "evidence": {
    "task_id": "task_...",
    "artifact_id": "artifact_test_output_..."
  },
  "expires_at": null
}
This solves the Anthropic “manual prompting unnecessary” point properly. The repeated instruction becomes memory or a rule. The human does not repeat it.
Concrete PR plan
PR 1: Instruction spine
Files:
AGENTS.md
CLAUDE.md
.codex/AGENTS.md
docs/agent-os.md
scripts/check-agent-instructions.ts
Goal:
	•	Make AGENTS.md the canonical cross-agent policy.
	•	Make CLAUDE.md import AGENTS.md.
	•	Make Codex use root AGENTS.md plus .codex/AGENTS.md.
	•	Add CI check that fails when CLAUDE.md does not import AGENTS.md.
	•	Delete duplicate stale instruction docs or replace them with imports.
This should preserve your existing “less is more” agency guidance, but move it into the root instruction spine.
PR 2: AgentProfile and InstructionBundle schemas
Files:
packages/a2a-sdk/src/agent-profile.ts
packages/a2a-sdk/src/instruction-bundle.ts
packages/a2a-sdk/src/task-intent.ts
packages/a2a-sdk/src/policy.ts
tests/a2a/agent-profile.contract.test.ts
tests/a2a/instruction-bundle.contract.test.ts
Goal:
	•	Define canonical agent profile.
	•	Define instruction bundle.
	•	Define task intents.
	•	Define approval and permission policies.
	•	Add schema tests so Claude, Codex, Recoder Code, and future agents cannot drift.
PR 3: Claude/Codex runtime adapter parity
Files:
docker-backend/src/a2a/runtime-adapter.ts
docker-backend/src/a2a/claude-runtime-adapter.ts
docker-backend/src/a2a/codex-runtime-adapter.ts
mcp/recoder-codex-adapter.js
tests/a2a/runtime-adapter.contract.test.ts
Goal:
	•	Wrap Claude connector and Codex adapter behind the same interface.
	•	Add auth headers to all A2A calls.
	•	Add signed envelope support.
	•	Add structured JSON-RPC errors.
	•	Add timeout and retry policy.
	•	Emit run events: started, log, artifact, needs_input, verified, failed, completed.
Immediate security fix: mcp/recoder-codex-adapter.js currently has default production URLs and a hard-coded Daytona URL/IP fallback. Make RECODER_DAYTONA_URL required or put safe local-only defaults in .env.example; do not ship a real network IP as a default.
Also, the current Codex adapter calls /api/a2a/agents and /api/a2a/tasks without an auth header, while only /v1/agent/start conditionally uses RECODER_API_TOKEN. Fix that before treating Codex as production-connected.
PR 4: Self-prompt compiler
Files:
packages/agent-instructions/src/compiler.ts
packages/agent-instructions/src/loaders/agents-md.ts
packages/agent-instructions/src/loaders/claude-md.ts
packages/agent-instructions/src/loaders/codex.ts
packages/agent-instructions/src/renderers/claude.ts
packages/agent-instructions/src/renderers/codex.ts
packages/agent-instructions/src/provenance.ts
tests/agent-instructions/compiler.test.ts
Goal:
	•	Take RecoderTaskSpec.
	•	Load instruction sources.
	•	Load repo/path rules.
	•	Load memory.
	•	Load agent profile and tool permissions.
	•	Produce a Claude/Codex-specific instruction bundle.
	•	Store provenance and source hashes.
This is the “prompt itself” layer.
PR 5: Hooks and policy enforcement
Files:
.claude/settings.json
.codex/config.toml
packages/agent-hooks/src/index.ts
packages/agent-hooks/src/secret-scan.ts
packages/agent-hooks/src/artifact-capture.ts
packages/agent-hooks/src/memory-candidate.ts
Hook policy:
	•	Before tool/file edit: check ownership, forbidden paths, secrets, lock state.
	•	After tool/file edit: capture changed files and emit audit event.
	•	Before compact: summarize run state into Recoder artifact.
	•	At stop: run verification plan and produce delivery summary.
	•	On subagent stop: attach subagent summary to parent run.
Codex hooks support deterministic lifecycle scripts around tool use, user prompt submission, compaction, subagent stop, and stop events. Claude Code supports hooks as well. Use hooks for deterministic policy, not “AI vibes.” (OpenAI Developers)
PR 6: Agent OS evals
Files:
tests/evals/agent-os/
  001-connect-agent.test.ts
  002-reconnect-no-duplicate.test.ts
  003-task-claim-run-artifact.test.ts
  004-approval-pause-resume.test.ts
  005-claude-codex-parity.test.ts
  006-forbidden-path-blocked.test.ts
  007-memory-candidate-review.test.ts
scripts/a2a-production-smoke.sh
Definition:
	•	Claude Code and Codex both connect.
	•	Both register capabilities.
	•	Reconnect does not duplicate identity.
	•	A task can be claimed.
	•	Logs stream.
	•	Artifact attaches.
	•	Approval pauses and resumes.
	•	Forbidden paths are blocked.
	•	Verification output is captured.
	•	Memory update is proposed, not silently written.
PR 7: UI surface
Files:
recoder-agents/src/app/agent-os/*
recoder-agents/src/components/agent-os/*
recoder-pm/.../approvals/*
recoder-web/app/components/workbench/AgentTeamPanel.tsx
Show:
	•	online agents
	•	capabilities
	•	current task
	•	loaded instruction sources
	•	memory used
	•	policy restrictions
	•	approval waits
	•	verification results
	•	artifacts
	•	PR/preview state
This will make Recoder feel like an operating system, not a chat wrapper.
Claude Code and Codex roles
Use both, but do not treat them as the same thing.
Claude Code
Best for:
	•	long-running implementation
	•	repo-aware refactors
	•	multi-step debugging
	•	skills-driven workflows
	•	memory-heavy project work
	•	subagent/team workflows
Use Claude Code with:
CLAUDE.md
.claude/skills/recoder/*
hooks
MCP
auto memory
subagents
Codex
Best for:
	•	parallel investigation
	•	PR review
	•	test generation
	•	isolated patch work
	•	cloud delegation
	•	reproducible CLI tasks
Use Codex with:
AGENTS.md
.codex/AGENTS.md
hooks
explicit subagents
verification-heavy prompts
Codex docs explicitly warn that subagents are useful for parallel work and keeping the main context clean, but write-heavy parallel workflows need caution. So Recoder should allow many read-only subagents, but only one write lock per file/path group. (OpenAI Developers)
The product loop to ship first
Use your existing launch gate, but make it agent-native:
signup
  -> choose plan
  -> create Space
  -> connect Claude Code / Codex / Recoder Code
  -> connect repo
  -> create task
  -> Recoder compiles instruction bundle
  -> agent claims task
  -> logs stream
  -> artifact appears
  -> verification runs
  -> PR opens
  -> preview deploys
  -> PM/human approves
  -> memory candidate generated
  -> task closes
Your own plan already defines that paid-user loop as the launch gate. Keep it narrow. Do not expand into marketplace, edge platform, agency OS, hosted compute, and deployment platform all at once.
Immediate fixes before deeper work
	1.	Remove hard-coded Daytona URL/IP fallback from Codex adapter. Require RECODER_DAYTONA_URL, or default to a local dev URL only.
	2.	Authenticate all Codex adapter A2A calls. Right now the agent/task calls do not consistently include bearer auth.
	3.	Stop silently swallowing malformed JSON-RPC input. The adapter currently catches JSON parse errors and ignores them. That hides broken clients and attacks. Return structured errors where possible.
	4.	Add signed envelope validation at every connector ingress. Your plan already says shared A2A validation and signed ingress are the baseline. Enforce it everywhere, including Codex.
	5.	Make instruction provenance visible. Every run should show: AGENTS.md hash, CLAUDE.md hash, Codex override hash, memory refs, task spec version, compiler version.
30/60/90-day execution plan
Days 1-10: Make instructions canonical
Ship PR 1 and PR 2.
Success:
	•	root AGENTS.md exists
	•	CLAUDE.md imports it
	•	Codex reads it
	•	schemas exist
	•	CI checks instruction consistency
	•	stale duplicate docs are removed or converted into imports
	•	every agent run can store an InstructionBundle
Days 11-30: Runtime parity
Ship PR 3 and PR 4.
Success:
	•	Claude and Codex implement the same runtime adapter contract
	•	both accept the same TaskEnvelope
	•	both receive compiled instruction bundles
	•	both emit the same run events
	•	both produce artifacts
	•	both support cancellation
	•	both expose health/capabilities
	•	both are covered by contract tests
Days 31-60: Verification and approval loop
Ship PR 5 and PR 6.
Success:
	•	hooks enforce forbidden paths
	•	verification commands run automatically
	•	browser verification attaches evidence
	•	approval pauses are first-class states
	•	memory candidates are proposed and reviewed
	•	production smoke validates the local-agent-to-Space flow
Days 61-90: Paid-user loop
Ship PR 7 and the product polish.
Success:
	•	user creates Space
	•	connects Claude Code or Codex
	•	agent appears online with capabilities
	•	creates task
	•	Recoder compiles instructions
	•	agent claims and runs
	•	artifacts stream
	•	PR/preview attaches
	•	PM approves/rejects
	•	Agency can consume the same artifact/history later
The first task spec to give Claude Code or Codex
Use this as the first implementation task. This is intentionally a task spec, not a giant prompt.
title: "Recoder Agent OS PR-1: canonical instruction spine"
intent: platform_hardening
repo: caelum0x/recoder.xyz
goal: >
  Create the canonical instruction spine for Claude Code, Codex, and Recoder agents.
  Recoder should own reusable instructions instead of relying on repeated manual prompting.

context:
  existing_files:
    - recoder-agency/AGENTS.md
    - recoder-agency/CLAUDE.md
    - .claude/skills/gstack/*
    - docs/plan.md
    - mcp/recoder-codex-adapter.js
  product_direction:
    - one workspace, many agents, controlled delivery
    - prompts become compiled instruction bundles
    - Recoder owns identity, policy, task state, verification, artifacts, approvals

deliverables:
  - AGENTS.md at repo root with canonical cross-agent rules
  - CLAUDE.md at repo root importing @AGENTS.md plus Claude-specific rules
  - .codex/AGENTS.md with Codex-specific rules and AGENTS.md reference
  - docs/agent-os.md explaining the instruction/memory/control-plane model
  - scripts/check-agent-instructions.ts validating CLAUDE.md imports AGENTS.md
  - package.json script: "agent:instructions:check"
  - CI hook or documented command for the check

constraints:
  - keep it small
  - no new dependencies unless necessary
  - do not rewrite runtime code in this PR
  - preserve existing agency guidance
  - avoid duplicate long instruction files

verification:
  - pnpm format
  - pnpm check-types
  - pnpm test
  - pnpm agent:instructions:check

acceptance:
  - Claude Code can load CLAUDE.md and receive root AGENTS.md content
  - Codex can load AGENTS.md rules
  - root instruction source is obvious to humans
  - stale duplicate instruction drift is reduced
  - next PR can build InstructionBundle compiler on top of this
Final recommendation
Start with the instruction spine, then the AgentProfile/InstructionBundle schema, then Claude/Codex runtime parity.
That is the clean path.
Recoder already has enough agent integrations. The missing product is the layer that makes them reliable together:
identity + policy + memory + task spec + compiled instructions + verification + approval + artifact history
That is Recoder’s moat.
## Direction

Do **not** put Claude Code, Codex, OpenCode, Gemini CLI, Qwen Code, Daytona, E2B, browser agents, or MCP servers at the center.

Put **Recoder Agent OS** at the center.

The OSS/proprietary tools become replaceable runtimes and connectors:

```text
Recoder owns:
  identity
  task state
  policy
  work locks
  instruction compilation
  memory provenance
  verification
  approvals
  artifacts
  audit trail

OSS / external stack provides:
  agent runtimes
  coding CLIs
  sandboxes
  MCP servers
  workflow workers
  tracing
  event bus
  auth
  deployment substrates
```

I confirmed `caelum0x/recoder.xyz` is the private main repo on branch `main`, so I would implement this inside the existing monorepo rather than starting a separate “agent platform” repo. 

---

# 1. Top-level architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                         Recoder UI                          │
│  recoder-web / recoder-pm / recoder-agents / recoder-agency │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                    Agent OS API Layer                       │
│  tasks, spaces, agents, approvals, artifacts, memory, runs  │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                    Control Plane Core                       │
│  AgentProfile, TaskSpec, InstructionBundle, Policy, Events  │
└───────┬───────────────┬─────────────────┬──────────────────┘
        │               │                 │
        │               │                 │
┌───────▼───────┐ ┌─────▼────────┐ ┌──────▼──────────┐
│ Runtime Layer │ │  MCP Layer   │ │ Workflow Layer  │
│ Claude/Codex  │ │ tools/data   │ │ durable runs    │
│ OpenCode/etc. │ │ resources    │ │ approvals       │
└───────┬───────┘ └─────┬────────┘ └──────┬──────────┘
        │               │                 │
┌───────▼───────────────▼─────────────────▼──────────────────┐
│                         OSS Stack                           │
│ A2A, MCP, Postgres, pgvector, NATS/CloudEvents, OTel, OPA,  │
│ Temporal/Trigger.dev, Daytona/E2B, Playwright, Grafana      │
└─────────────────────────────────────────────────────────────┘
```

The important point: **Recoder state is canonical. OSS systems are adapters.**
That means no framework should own your task graph, memory, approvals, or artifacts.

---

# 2. Proposed folder structure

I would not aggressively rename your existing folders. Add a clean Agent OS layer and connect the current apps to it.

```text
recoder.xyz/
├── AGENTS.md
├── CLAUDE.md
├── .codex/
│   ├── AGENTS.md
│   ├── config.toml
│   └── hooks/
│       ├── pre-tool-use.ts
│       ├── post-tool-use.ts
│       ├── stop.ts
│       └── memory-candidate.ts
│
├── .claude/
│   ├── settings.json
│   ├── rules/
│   │   ├── agent-os.md
│   │   ├── security.md
│   │   ├── testing.md
│   │   └── monorepo.md
│   └── skills/
│       └── recoder-platform/
│           ├── SKILL.md
│           ├── task-spec-template.yaml
│           ├── delivery-summary-template.md
│           └── verification-playbook.md
│
├── apps/
│   ├── agent-gateway/
│   │   ├── src/
│   │   │   ├── http/
│   │   │   ├── websocket/
│   │   │   ├── a2a/
│   │   │   ├── mcp/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── agent-worker/
│   │   ├── src/
│   │   │   ├── workflows/
│   │   │   ├── activities/
│   │   │   ├── queues/
│   │   │   ├── schedulers/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── recoder-agents/
│   ├── recoder-pm/
│   ├── recoder-agency/
│   └── recoder-web/
│
├── packages/
│   ├── agent-os/
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   │   ├── agent-profile.ts
│   │   │   │   ├── task-spec.ts
│   │   │   │   ├── task-run.ts
│   │   │   │   ├── artifact.ts
│   │   │   │   ├── approval.ts
│   │   │   │   ├── memory-item.ts
│   │   │   │   ├── work-lock.ts
│   │   │   │   └── event.ts
│   │   │   ├── services/
│   │   │   │   ├── task-service.ts
│   │   │   │   ├── agent-service.ts
│   │   │   │   ├── run-service.ts
│   │   │   │   ├── approval-service.ts
│   │   │   │   ├── artifact-service.ts
│   │   │   │   └── memory-service.ts
│   │   │   ├── ports/
│   │   │   │   ├── runtime-adapter.ts
│   │   │   │   ├── workflow-driver.ts
│   │   │   │   ├── event-bus.ts
│   │   │   │   ├── policy-engine.ts
│   │   │   │   ├── artifact-store.ts
│   │   │   │   └── memory-store.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── a2a-sdk/
│   │   ├── src/
│   │   │   ├── schemas/
│   │   │   │   ├── agent-card.ts
│   │   │   │   ├── task-envelope.ts
│   │   │   │   ├── message-part.ts
│   │   │   │   ├── artifact-part.ts
│   │   │   │   ├── signed-envelope.ts
│   │   │   │   └── errors.ts
│   │   │   ├── client/
│   │   │   ├── server/
│   │   │   ├── signing/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── agent-instructions/
│   │   ├── src/
│   │   │   ├── compiler.ts
│   │   │   ├── bundle.ts
│   │   │   ├── provenance.ts
│   │   │   ├── source-loaders/
│   │   │   │   ├── agents-md-loader.ts
│   │   │   │   ├── claude-md-loader.ts
│   │   │   │   ├── codex-loader.ts
│   │   │   │   ├── repo-rules-loader.ts
│   │   │   │   └── memory-loader.ts
│   │   │   ├── renderers/
│   │   │   │   ├── claude-code-renderer.ts
│   │   │   │   ├── codex-renderer.ts
│   │   │   │   ├── opencode-renderer.ts
│   │   │   │   └── generic-renderer.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── agent-runtimes/
│   │   ├── src/
│   │   │   ├── adapters/
│   │   │   │   ├── claude-code-adapter.ts
│   │   │   │   ├── codex-adapter.ts
│   │   │   │   ├── recoder-code-adapter.ts
│   │   │   │   ├── opencode-adapter.ts
│   │   │   │   ├── qwen-code-adapter.ts
│   │   │   │   ├── gemini-cli-adapter.ts
│   │   │   │   └── browser-agent-adapter.ts
│   │   │   ├── runtime-events.ts
│   │   │   ├── runtime-errors.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── agent-policy/
│   │   ├── src/
│   │   │   ├── engine.ts
│   │   │   ├── evaluators/
│   │   │   │   ├── ts-policy-engine.ts
│   │   │   │   └── opa-policy-engine.ts
│   │   │   ├── rules/
│   │   │   │   ├── file-access.ts
│   │   │   │   ├── secret-access.ts
│   │   │   │   ├── network-access.ts
│   │   │   │   ├── tool-use.ts
│   │   │   │   └── approval-required.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── agent-events/
│   │   ├── src/
│   │   │   ├── cloudevent.ts
│   │   │   ├── event-types.ts
│   │   │   ├── outbox.ts
│   │   │   ├── nats-publisher.ts
│   │   │   ├── postgres-publisher.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── agent-memory/
│   │   ├── src/
│   │   │   ├── memory-store.ts
│   │   │   ├── memory-candidate.ts
│   │   │   ├── memory-review.ts
│   │   │   ├── vector-search.ts
│   │   │   ├── adapters/
│   │   │   │   ├── postgres-pgvector.ts
│   │   │   │   └── mem0-adapter.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── agent-mcp/
│   │   ├── src/
│   │   │   ├── host/
│   │   │   ├── servers/
│   │   │   │   ├── github-server.ts
│   │   │   │   ├── repo-server.ts
│   │   │   │   ├── browser-server.ts
│   │   │   │   ├── memory-server.ts
│   │   │   │   ├── deployment-server.ts
│   │   │   │   └── billing-server.ts
│   │   │   ├── registry.ts
│   │   │   ├── permissions.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── agent-workflows/
│   │   ├── src/
│   │   │   ├── workflow-definition.ts
│   │   │   ├── workflow-runner.ts
│   │   │   ├── nodes/
│   │   │   │   ├── agent-node.ts
│   │   │   │   ├── tool-node.ts
│   │   │   │   ├── approval-node.ts
│   │   │   │   ├── condition-node.ts
│   │   │   │   ├── parallel-node.ts
│   │   │   │   └── verification-node.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── agent-oss/
│       ├── src/
│       │   ├── daytona/
│       │   ├── e2b/
│       │   ├── playwright/
│       │   ├── github/
│       │   ├── openziti/
│       │   ├── litellm/
│       │   ├── langgraph/
│       │   ├── autogen/
│       │   ├── crewai/
│       │   └── index.ts
│       └── package.json
│
├── docker-backend/
│   └── src/
│       ├── agent-os/
│       │   ├── routes/
│       │   ├── controllers/
│       │   ├── repositories/
│       │   ├── migrations/
│       │   └── service-container.ts
│       └── existing-code...
│
├── mcp/
│   ├── recoder-mcp-server/
│   ├── recoder-codex-adapter/
│   ├── recoder-claude-bridge/
│   └── shared/
│
├── infra/
│   ├── docker-compose.agent-os.yml
│   ├── docker-compose.observability.yml
│   ├── docker-compose.sandbox.yml
│   ├── k8s/
│   ├── helm/
│   ├── terraform/
│   └── openziti/
│
├── docs/
│   ├── agent-os/
│   │   ├── 00-overview.md
│   │   ├── 01-architecture.md
│   │   ├── 02-task-lifecycle.md
│   │   ├── 03-instruction-compiler.md
│   │   ├── 04-runtime-adapters.md
│   │   ├── 05-mcp-integration.md
│   │   ├── 06-oss-stack.md
│   │   ├── 07-security-model.md
│   │   ├── 08-observability.md
│   │   └── 09-self-hosting.md
│   └── existing-docs...
│
├── tests/
│   ├── contracts/
│   │   ├── a2a/
│   │   ├── mcp/
│   │   ├── runtime-adapters/
│   │   └── instruction-bundles/
│   ├── evals/
│   │   └── agent-os/
│   ├── integration/
│   └── e2e/
│
└── scripts/
    ├── check-agent-instructions.ts
    ├── generate-agent-schemas.ts
    ├── agent-os-smoke.ts
    ├── a2a-smoke.ts
    ├── mcp-smoke.ts
    └── verify-runtime-adapter.ts
```

---

# 3. Package responsibilities

## `packages/agent-os`

This is the domain core. It should have **zero dependency** on Claude, Codex, MCP, Daytona, E2B, LangGraph, or any specific model provider.

Core entities:

```ts
AgentProfile
TaskSpec
TaskRun
InstructionBundle
Artifact
Approval
MemoryItem
MemoryCandidate
WorkLock
RunEvent
PolicyDecision
```

This package answers:

```text
What is an agent?
What is a task?
What is a run?
What is an approval?
What is an artifact?
What is memory?
What is a lock?
What state transitions are legal?
```

---

## `packages/a2a-sdk`

This is your interoperability layer.

Use A2A concepts directly: Agent Cards, task operations, messages, parts, artifacts, streaming events, cancellation, and authenticated/extended agent cards. The A2A spec already defines operations such as send message, streaming send, get task, list tasks, cancel task, subscribe to task, push notification config, and extended Agent Card retrieval, plus data objects for tasks, messages, artifacts, agent capabilities, agent skills, security schemes, and signing. ([A2A Protocol][1])

Recoder-specific additions:

```text
SignedTaskEnvelope
RecoderTaskSpec
InstructionBundleRef
PolicyDecisionRef
WorkLockRef
VerificationPlan
ApprovalGate
```

Rule: **A2A is the wire protocol. Recoder Agent OS is the product protocol.**

---

## `packages/agent-instructions`

This is the “prompt itself” layer.

It compiles:

```text
human intent
+ task spec
+ repo rules
+ AGENTS.md
+ CLAUDE.md
+ Codex rules
+ path-specific policy
+ memory refs
+ tool permissions
+ verification plan
= runtime-specific instruction bundle
```

Claude Code officially uses `CLAUDE.md` and auto memory, and Anthropic specifically says Claude Code reads `CLAUDE.md`, not `AGENTS.md`, but recommends importing `AGENTS.md` from `CLAUDE.md` when a repo already uses `AGENTS.md`. ([Claude API Docs][2])

Codex officially reads `AGENTS.md` before doing work and builds an instruction chain from global and project files, with nearer directory guidance overriding earlier guidance. ([OpenAI Developers][3])

So Recoder should generate and track:

```ts
type InstructionBundle = {
  id: string;
  taskId: string;
  agentId: string;
  runtime: "claude_code" | "codex" | "opencode" | "qwen_code" | "gemini_cli";
  sharedGoal: string;
  renderedPrompt: string;
  acceptanceCriteria: string[];
  verificationCommands: string[];
  forbiddenActions: string[];
  approvalGates: ApprovalGate[];
  memoryRefs: MemoryRef[];
  sourceRefs: InstructionSourceRef[];
  provenance: {
    compilerVersion: string;
    sourceHashes: Array<{ path: string; sha256: string }>;
    compiledAt: string;
  };
};
```

---

## `packages/agent-runtimes`

This wraps every coding/runtime agent behind one interface.

```ts
export interface AgentRuntimeAdapter {
  id: string;
  kind:
    | "claude_code"
    | "codex"
    | "recoder_code"
    | "opencode"
    | "qwen_code"
    | "gemini_cli"
    | "browser_agent"
    | "custom";

  health(): Promise<RuntimeHealth>;
  capabilities(): Promise<AgentCapability[]>;

  sendTask(input: {
    task: TaskSpec;
    bundle: InstructionBundle;
    policy: RuntimePolicy;
  }): AsyncIterable<RunEvent>;

  cancel(runId: string): Promise<void>;
  approve?(approvalId: string, decision: ApprovalDecision): Promise<void>;
}
```

Adapters live here, not in product apps:

```text
claude-code-adapter.ts
codex-adapter.ts
opencode-adapter.ts
qwen-code-adapter.ts
gemini-cli-adapter.ts
browser-agent-adapter.ts
```

---

## `packages/agent-mcp`

MCP should be your **tool/data connector standard**, not your agent state standard.

MCP standardizes how LLM applications connect to external context and tools through JSON-RPC, with server features including resources, prompts, and tools, plus client features such as roots, sampling, and elicitation. ([Model Context Protocol][4])

Recoder should expose MCP servers like:

```text
recoder.github
recoder.repo
recoder.browser
recoder.memory
recoder.deploy
recoder.billing
recoder.preview
recoder.logs
recoder.approvals
```

But Recoder should also be an MCP host/client so it can consume external MCP servers.

Architecture:

```text
Claude/Codex/agent
   ↓
Recoder MCP Host
   ↓
MCP Registry
   ↓
Allowed MCP Servers
   ↓
Policy Engine
   ↓
Tool Call
```

Important security rule: MCP tool descriptions are not enforcement. MCP itself warns that tools may represent arbitrary code execution and that users should retain consent/control over data access and operations. ([Model Context Protocol][4])

---

## `packages/agent-policy`

Start with TypeScript policies. Add OPA when policies become cross-service or customer-configurable.

OPA is an OSS, general-purpose policy engine that decouples policy decision-making from enforcement and can return arbitrary structured decisions, not only allow/deny. ([Open Policy Agent][5])

Policy checks:

```text
Can this agent claim this task?
Can this agent edit this path?
Can this task run network commands?
Can this tool call access secrets?
Does this change require approval?
Can this runtime push a branch?
Can this memory candidate be accepted?
Can this artifact be public?
```

Example file policy:

```ts
type PolicyInput = {
  actor: AgentProfile;
  task: TaskSpec;
  action:
    | "file.read"
    | "file.write"
    | "command.run"
    | "tool.call"
    | "memory.write"
    | "artifact.publish"
    | "deploy.preview";
  target: {
    path?: string;
    command?: string;
    toolName?: string;
    environment?: string;
  };
};
```

---

## `packages/agent-events`

Use CloudEvents as the standard event envelope.

CloudEvents exists to describe event data in a common way and simplify event declaration and delivery across services and platforms. ([cloudevents.io][6])

Event names:

```text
recoder.agent.connected
recoder.agent.disconnected
recoder.agent.capabilities.updated
recoder.task.created
recoder.task.compiled
recoder.task.claimed
recoder.run.started
recoder.run.log.appended
recoder.artifact.created
recoder.approval.requested
recoder.approval.approved
recoder.approval.rejected
recoder.verification.started
recoder.verification.completed
recoder.memory.candidate.created
recoder.memory.accepted
recoder.run.completed
recoder.run.failed
```

Event shape:

```ts
type RecoderCloudEvent<T> = {
  specversion: "1.0";
  id: string;
  source: `recoder://${string}`;
  type: string;
  subject: string;
  time: string;
  datacontenttype: "application/json";
  data: T;
};
```

Transport options:

```text
Phase 1: Postgres outbox
Phase 2: NATS JetStream
Phase 3: customer/webhook/event-bus integrations
```

NATS JetStream is a good fit when you need replayable, fault-tolerant, high-availability message streams; it stores and replays messages for consumers and is built into `nats-server`. ([NATS Docs][7])

---

## `packages/agent-memory`

Memory is not “random notes the model wrote.”

Memory should be:

```text
reviewable
scoped
cited
expirable
provenance-linked
```

Scopes:

```text
user
org
space
repo
path
agent
task-type
```

Memory lifecycle:

```text
candidate_created
  -> reviewed
  -> accepted | rejected
  -> active
  -> superseded | expired
```

Store canonical memory in Postgres + pgvector. mem0 can be an adapter or enhancement, not source of truth.

---

## `packages/agent-workflows`

This is the visual/workflow execution model.

Nodes:

```text
agent
tool
condition
parallel
approval
verification
memory
artifact
deploy
browser-check
```

Do not couple this to LangGraph, CrewAI, AutoGen, or Temporal directly. Make them optional workflow drivers.

```ts
export interface WorkflowDriver {
  start(definition: WorkflowDefinition): Promise<WorkflowRun>;
  signal(runId: string, signal: WorkflowSignal): Promise<void>;
  cancel(runId: string): Promise<void>;
}
```

---

# 4. OSS stack decision table

| Layer                   |     Use OSS? | Recommendation                                                                                       |
| ----------------------- | -----------: | ---------------------------------------------------------------------------------------------------- |
| Agent-to-agent protocol |          Yes | Use A2A as external wire protocol; keep Recoder task semantics inside `TaskSpec`.                    |
| Tool/data protocol      |          Yes | Use MCP for tools, resources, prompts, connectors.                                                   |
| Instruction files       |          Yes | Root `AGENTS.md`; `CLAUDE.md` imports it; Codex reads `AGENTS.md`.                                   |
| Runtime agents          |          Yes | Claude Code, Codex, OpenCode, Qwen Code, Gemini CLI as adapters.                                     |
| Workflow durability     |        Maybe | Start with Postgres outbox + worker. Add Trigger.dev or Temporal when runs need stronger durability. |
| Events                  |          Yes | CloudEvents envelope.                                                                                |
| Event transport         |        Maybe | Postgres outbox first; NATS JetStream for replay and scale.                                          |
| Policy                  |          Yes | TypeScript first; OPA/Rego for customer/admin policy.                                                |
| Observability           |          Yes | OpenTelemetry traces/logs/metrics.                                                                   |
| Memory                  |        Mixed | Postgres + pgvector canonical; mem0 adapter optional.                                                |
| Sandbox                 |          Yes | Daytona/E2B adapters; later self-hosted Firecracker/K8s runner.                                      |
| Browser automation      |          Yes | Playwright first; browser-use/Stagehand as adapters only.                                            |
| Agent frameworks        | Adapter only | LangGraph, AutoGen, CrewAI should not own Recoder core state.                                        |
| Auth                    |          Yes | Existing auth first; Keycloak/Zitadel optional for self-host enterprise.                             |
| Network isolation       |          Yes | OpenZiti/headscale/Tailscale-style private networks as deployment options.                           |

---

# 5. Build vs borrow

## Build inside Recoder

Build these yourself because they are your product moat:

```text
AgentProfile
TaskSpec
InstructionBundle
Instruction compiler
Approval model
Artifact model
Memory review model
Work locks
Policy gates
Run event model
Agent capability registry
Runtime adapter interface
UI for agent state
UI for instruction provenance
UI for approvals and verification
```

## Borrow from OSS

Borrow these because they are infrastructure:

```text
MCP SDK
A2A schemas/SDK where useful
Postgres
pgvector
NATS JetStream
CloudEvents SDKs
OpenTelemetry
OPA
Temporal or Trigger.dev
Playwright
Daytona
E2B
Grafana/Prometheus/Loki/Tempo
Sentry
```

## Wrap as adapters

Wrap these because they will change quickly:

```text
Claude Code
Codex
OpenCode
Qwen Code
Gemini CLI
LangGraph
AutoGen
CrewAI
mem0
LiteLLM
browser-use
Stagehand
Sourcegraph/OpenGrok/code-search tools
```

---

# 6. Runtime connection model

## Claude Code

Use:

```text
CLAUDE.md
.claude/rules/*
.claude/skills/*
.claude/settings.json
hooks
MCP
```

Claude skills are folders with `SKILL.md`; each skill has YAML frontmatter and markdown instructions, and Claude can load skills based on description or direct invocation. ([Claude API Docs][8])

Recommended layout:

```text
.claude/
├── settings.json
├── rules/
│   ├── security.md
│   ├── testing.md
│   ├── api.md
│   └── frontend.md
└── skills/
    └── recoder-platform/
        ├── SKILL.md
        ├── task-spec-template.yaml
        ├── verification-playbook.md
        └── delivery-summary-template.md
```

`CLAUDE.md`:

```md
@AGENTS.md

## Claude Code specific rules

- Prefer Recoder task specs over freeform prompts.
- Use Recoder MCP tools for task state, artifacts, memory, and approvals.
- Do not write memory directly; create a memory candidate artifact.
- Respect work locks and approval gates.
```

---

## Codex

Use:

```text
AGENTS.md
.codex/AGENTS.md
.codex/config.toml
.codex/hooks/*
```

Codex hooks are deterministic lifecycle scripts that can send conversation data to logging, scan prompts for API keys, create persistent memories, run validation checks, and customize behavior for directories. ([OpenAI Developers][9])

`.codex/AGENTS.md`:

```md
# Codex-specific Recoder rules

Read ../AGENTS.md as the canonical repo policy.

- Always load the Recoder task spec before proposing changes.
- Always report loaded instruction sources.
- Do not edit files without acquiring a work lock.
- Run verification commands from the task spec.
- Emit artifacts through Recoder MCP or A2A before finishing.
```

`.codex/hooks/pre-tool-use.ts` should check:

```text
forbidden paths
secret paths
work lock ownership
dangerous commands
network rules
approval requirements
```

---

# 7. API structure

Use these API groups:

```text
/api/agent-os/agents
/api/agent-os/tasks
/api/agent-os/runs
/api/agent-os/artifacts
/api/agent-os/approvals
/api/agent-os/memory
/api/agent-os/instructions
/api/agent-os/policies
/api/agent-os/events
/api/agent-os/workflows
```

A2A-compatible endpoints:

```text
GET  /.well-known/agent-card.json
GET  /api/a2a/agents
POST /api/a2a/message
POST /api/a2a/message/stream
GET  /api/a2a/tasks/:taskId
GET  /api/a2a/tasks
POST /api/a2a/tasks/:taskId/cancel
GET  /api/a2a/tasks/:taskId/subscribe
POST /api/a2a/artifacts
POST /api/a2a/push-notifications
```

MCP endpoints:

```text
/api/mcp
/api/mcp/servers
/api/mcp/tools
/api/mcp/resources
/api/mcp/prompts
/api/mcp/sessions
```

Internal worker endpoints should not be public:

```text
/internal/agent-os/outbox/drain
/internal/agent-os/runs/tick
/internal/agent-os/verify
/internal/agent-os/memory/review
```

---

# 8. Database tables

Minimum useful schema:

```text
agent_profiles
agent_sessions
agent_capabilities
agent_runtime_connections

spaces
space_members
space_repositories
space_policies

tasks
task_runs
task_run_steps
task_assignments

instruction_bundles
instruction_sources
instruction_source_hashes

work_locks
approval_requests
approval_decisions

artifacts
artifact_parts
artifact_links

memory_items
memory_candidates
memory_reviews
memory_embeddings

events
event_outbox
webhook_deliveries

mcp_servers
mcp_tools
mcp_sessions
mcp_tool_calls

runtime_credentials
connector_installations
audit_log
```

Important indexes:

```sql
agent_sessions(agent_id, status, last_seen_at)
tasks(space_id, status, created_at)
task_runs(task_id, status, started_at)
work_locks(space_id, repo_id, path_glob, expires_at)
events(space_id, type, time)
event_outbox(status, created_at)
memory_embeddings USING ivfflat/hnsw
```

---

# 9. Event flow

## Task creation

```text
User creates task
  -> task.created
  -> instruction compiler loads sources
  -> instruction_bundle.created
  -> policy evaluated
  -> task.ready_for_agent
```

## Agent claim

```text
Agent connects
  -> agent.connected
  -> capabilities.updated
  -> agent claims task
  -> work locks acquired
  -> task.claimed
  -> run.started
```

## Runtime execution

```text
Runtime adapter sends compiled bundle
  -> logs stream
  -> tool calls pass through policy
  -> artifacts attach
  -> approval requested when needed
  -> verification runs
  -> delivery summary created
```

## Completion

```text
run.completed
  -> memory candidates proposed
  -> PR/preview attached
  -> PM/human approval
  -> task.completed
```

---

# 10. Workflow engine choice

## Phase 1: Postgres outbox + worker

Use this first.

It is simplest and fits the existing monorepo.

```text
Postgres tables:
  events
  event_outbox
  task_runs
  work_locks

Worker:
  polls outbox
  executes small state transitions
  retries failed events
  emits run updates
```

## Phase 2: Trigger.dev

Use Trigger.dev if you want TypeScript-native background tasks, long-running AI jobs, retries, queues, realtime run status, waits, and human-in-the-loop tokens. Trigger.dev describes itself as an open-source background jobs framework for reliable workflows in async code, with AI tasks, queues, retries, real-time monitoring, and self-hosting support. ([Trigger.dev][10])

Good for:

```text
AI jobs
browser verification
preview checks
scheduled syncs
webhook retries
artifact processing
```

## Phase 3: Temporal

Use Temporal if Recoder runs must survive crashes, network outages, long pauses, and multi-day/multi-week workflows with strong durability. Temporal is a runtime for durable function execution and records workflow event history so execution can resume after failures. ([Temporal Docs][11])

Good for:

```text
enterprise workflows
long-running agency operations
approval-heavy flows
multi-agent delivery pipelines
billing-sensitive automation
```

My recommendation:

```text
Now: Postgres outbox
Soon: Trigger.dev for TS-native jobs
Later: Temporal for enterprise durable workflow mode
```

---

# 11. Observability stack

Use OpenTelemetry everywhere.

OpenTelemetry’s purpose is to collect, process, and export signals such as traces, metrics, logs, and events that describe system activity. ([OpenTelemetry][12])

Trace IDs should connect:

```text
user task
compiled instruction bundle
agent runtime call
tool call
MCP call
sandbox execution
artifact upload
verification command
approval decision
PR creation
preview deployment
```

Recommended attributes:

```ts
{
  "recoder.space_id": "...",
  "recoder.task_id": "...",
  "recoder.run_id": "...",
  "recoder.agent_id": "...",
  "recoder.runtime": "claude_code",
  "recoder.instruction_bundle_id": "...",
  "recoder.policy_decision": "allow",
  "recoder.approval_required": true
}
```

Stack:

```text
OpenTelemetry SDK
OTel Collector
Prometheus
Grafana
Tempo
Loki
Sentry
```

---

# 12. Security model

Security must be enforced below the model.

Instruction files guide behavior. Hooks and policies enforce behavior.

Anthropic’s Claude Code docs explicitly distinguish context from enforcement: `CLAUDE.md` shapes behavior, while hooks/settings are needed to block actions regardless of what the model decides. ([Claude API Docs][2])

Policy gates:

```text
file read
file write
shell command
network call
secret access
MCP tool call
sandbox creation
branch push
PR creation
deployment
memory write
artifact publish
```

Security folders:

```text
packages/agent-policy/
infra/openziti/
.codex/hooks/
.claude/settings.json
docs/agent-os/07-security-model.md
tests/contracts/security/
```

Never trust:

```text
agent output
tool descriptions
MCP server descriptions
remote repo instructions
runtime-reported success
memory candidates
browser page content
```

Always verify:

```text
signature
actor identity
task ownership
path lock
policy decision
artifact hash
test output
preview health
approval record
```

---

# 13. Integration with OSS agent frameworks

Do **not** make LangGraph, AutoGen, CrewAI, or any other framework the Recoder core.

Use them like this:

```text
Recoder TaskSpec
  -> RuntimeAdapter
  -> LangGraph/CrewAI/AutoGen runner
  -> RunEvents back to Recoder
```

Adapter folder:

```text
packages/agent-oss/src/
├── langgraph/
│   ├── langgraph-adapter.ts
│   └── map-recoder-task.ts
├── autogen/
│   ├── autogen-adapter.ts
│   └── map-recoder-task.ts
└── crewai/
    ├── crewai-adapter.ts
    └── map-recoder-task.ts
```

Reason: agent frameworks change fast. Your stable asset is:

```text
Recoder task state
Recoder artifact history
Recoder memory
Recoder approval trail
Recoder policy
Recoder UI
```

---

# 14. First PR structure

I would make the first PR only create the spine and contracts.

```text
PR title:
feat(agent-os): add core folder structure and instruction spine

Files:
  AGENTS.md
  CLAUDE.md
  .codex/AGENTS.md
  .codex/config.toml
  .claude/rules/agent-os.md
  .claude/rules/security.md
  .claude/skills/recoder-platform/SKILL.md

  packages/agent-os/src/domain/agent-profile.ts
  packages/agent-os/src/domain/task-spec.ts
  packages/agent-os/src/domain/instruction-bundle.ts
  packages/agent-os/src/domain/artifact.ts
  packages/agent-os/src/domain/approval.ts
  packages/agent-os/src/domain/memory-item.ts
  packages/agent-os/src/domain/work-lock.ts
  packages/agent-os/src/domain/event.ts
  packages/agent-os/src/index.ts

  packages/a2a-sdk/src/schemas/task-envelope.ts
  packages/a2a-sdk/src/schemas/signed-envelope.ts

  packages/agent-instructions/src/compiler.ts
  packages/agent-instructions/src/bundle.ts
  packages/agent-instructions/src/provenance.ts

  docs/agent-os/00-overview.md
  docs/agent-os/01-architecture.md
  docs/agent-os/06-oss-stack.md

  tests/contracts/agent-os/task-spec.contract.test.ts
  tests/contracts/agent-os/instruction-bundle.contract.test.ts
```

No runtime rewrite in PR 1.

Acceptance:

```text
Root instruction spine exists.
Claude imports root AGENTS.md.
Codex has project-specific instructions.
Agent OS domain schemas compile.
InstructionBundle type exists.
TaskSpec type exists.
Docs explain OSS boundaries.
No production behavior changed.
```

---

# 15. Second PR

```text
PR title:
feat(agent-os): add runtime adapter interface and Claude/Codex adapters

Files:
  packages/agent-runtimes/src/runtime-adapter.ts
  packages/agent-runtimes/src/adapters/claude-code-adapter.ts
  packages/agent-runtimes/src/adapters/codex-adapter.ts
  packages/agent-runtimes/src/runtime-events.ts
  packages/agent-runtimes/src/runtime-errors.ts

  apps/agent-gateway/src/a2a/routes.ts
  apps/agent-gateway/src/websocket/agent-sessions.ts
  apps/agent-gateway/src/http/health.ts

  tests/contracts/runtime-adapters/claude-code.contract.test.ts
  tests/contracts/runtime-adapters/codex.contract.test.ts
```

Acceptance:

```text
Claude and Codex expose same runtime interface.
Both report health.
Both report capabilities.
Both accept TaskSpec + InstructionBundle.
Both emit RunEvents.
Both support cancellation.
```

---

# 16. Third PR

```text
PR title:
feat(agent-os): add policy gates, work locks, and event outbox

Files:
  packages/agent-policy/src/*
  packages/agent-events/src/*
  docker-backend/src/agent-os/repositories/*
  docker-backend/src/agent-os/migrations/*
  .codex/hooks/pre-tool-use.ts
  .codex/hooks/post-tool-use.ts
  .claude/settings.json
```

Acceptance:

```text
Agents cannot write without a lock.
Forbidden paths are blocked.
Dangerous commands require approval.
Every run event writes to outbox.
Every artifact has hash/provenance.
```

---

# 17. The exact product boundary

Recoder should be:

```text
Agent control plane
Task operating system
Instruction compiler
Verification engine
Approval system
Artifact ledger
Memory review system
OSS integration layer
```

Recoder should **not** be:

```text
another generic chatbot
a LangGraph clone
a CrewAI clone
a Temporal clone
an MCP directory clone
a model router only
a prompt-library product
```

The clean architecture is:

```text
Recoder core is boring and stable.
Adapters are messy and replaceable.
OSS stack is used for infrastructure.
Product value is state, trust, verification, and coordination.
```

This is the structure I would build.

[1]: https://a2a-protocol.org/latest/specification/ "Overview - A2A Protocol"
[2]: https://docs.anthropic.com/en/docs/claude-code/memory "How Claude remembers your project - Claude Code Docs"
[3]: https://developers.openai.com/codex/guides/agents-md "Custom instructions with AGENTS.md – Codex | OpenAI Developers"
[4]: https://modelcontextprotocol.io/specification/2025-06-18 "Specification - Model Context Protocol"
[5]: https://www.openpolicyagent.org/docs/latest/ "Open Policy Agent (OPA) | Open Policy Agent"
[6]: https://cloudevents.io/ "CloudEvents |"
[7]: https://docs.nats.io/nats-concepts/jetstream "JetStream | NATS Docs"
[8]: https://docs.anthropic.com/en/docs/claude-code/skills "Extend Claude with skills - Claude Code Docs"
[9]: https://developers.openai.com/codex/hooks "Hooks – Codex | OpenAI Developers"
[10]: https://trigger.dev/docs/introduction "Welcome to the Trigger.dev docs - Trigger.dev"
[11]: https://docs.temporal.io/temporal "What is Temporal? | Temporal Platform Documentation"
[12]: https://opentelemetry.io/docs/concepts/signals/ "Signals | OpenTelemetry"
