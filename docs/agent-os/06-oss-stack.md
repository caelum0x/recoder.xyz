# Agent OS OSS Stack

Use OSS for infrastructure, not product ownership.

## Use Directly

- A2A for agent wire interoperability.
- MCP for tools, resources, prompts, and connector surfaces.
- CloudEvents for event envelopes.
- Postgres/outbox first for reliable event processing.
- OpenTelemetry for traces, logs, metrics, and event correlation.
- Playwright for browser verification.

## Wrap As Adapters

- Claude Code
- Codex
- Recoder Code
- OpenCode
- Qwen Code
- Gemini CLI
- Daytona and E2B
- LangGraph, AutoGen, and CrewAI
- mem0 and external memory providers

## Keep In Recoder

- AgentProfile
- TaskSpec
- InstructionBundle
- approval model
- artifact ledger
- memory review model
- work locks
- policy gates
- run events
- capability registry

The stable moat is trustworthy coordination, not ownership of every execution substrate.

## API Visibility

`POST /api/agent-os/oss/components` registers a `RecoderComponentDescriptor` with the control plane. `GET /api/agent-os/oss` returns registered components plus canonical-state owner candidates, security risk summaries, and registry validation findings. The backend Agent OS router and standalone agent gateway expose the same shape so operators can inspect contracts and risk posture without reading YAML manifests manually.
