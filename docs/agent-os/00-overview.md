# Recoder Agent OS Overview

Recoder Agent OS is the control plane for agent work. Claude Code, Codex, Recoder Code, OpenCode, Qwen Code, Gemini CLI, browser agents, sandboxes, and MCP servers are runtimes or connectors.

Recoder owns:

- agent identity and capabilities
- task specs and run state
- instruction compilation and provenance
- policy gates and work locks
- approvals and verification
- artifacts and audit history
- reviewed memory lifecycle

The product boundary is deliberate: frameworks and CLIs execute work, but Recoder remains the source of truth for state, trust, and handoff.

`@recoder/ui-agent-os` provides shared UI contracts for this state. `buildAgentOsCockpitSummary` folds agents, runs, instruction bundles, approvals, artifacts, memory candidates, policy restrictions, work locks, and OSS component risk into one cockpit-ready model so Agents, PM, Agency, and Web do not invent incompatible dashboard shapes.

The backend Agent OS router and standalone agent gateway expose this model at `GET /api/agent-os/summary`.

## Core Flow

```text
human intent
  -> Recoder TaskSpec
  -> compiled InstructionBundle
  -> runtime adapter
  -> RunEvents
  -> verification, artifacts, approvals
  -> reviewed memory candidate
```

See `docs/arch.md` for the full plan and package map.
