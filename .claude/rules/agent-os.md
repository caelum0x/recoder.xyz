# Recoder Agent OS

Recoder is the control plane. Claude Code is a runtime.

When working in this repo:

- Treat `AGENTS.md` as the canonical cross-agent policy and `CLAUDE.md` as the Claude-specific entrypoint.
- Prefer Recoder task specs over freeform prompts for multi-step work.
- Preserve compiled instruction bundles as auditable artifacts when a run is orchestrated by Recoder.
- Keep agent identity, task state, approvals, memory provenance, verification, artifacts, and audit history in Recoder-owned contracts.
- Do not move canonical task state into Claude Code, Codex, MCP, Daytona, E2B, LangGraph, CrewAI, AutoGen, or any other adapter.
- Use runtime adapters as replaceable execution surfaces that emit shared `RunEvent` records back to Recoder.
- Propose memory updates as reviewable memory candidates with evidence; never write durable memory directly.

If a task conflicts with an approval gate, work lock, forbidden path, or runtime permission, stop and surface the policy decision instead of trying to bypass it.
