# Route Ownership Decisions

Agent OS route ownership is explicit so PM, Agents, Agency, A2A, and MCP do not create parallel state stores.

## Canonical Owners

| Route family | Owner | Canonical state |
| --- | --- | --- |
| `/api/agent-os/tasks*` | Agent OS backend | `TaskSpec`, task history, routing metadata |
| `/api/agent-os/runs*` | Agent OS backend | `TaskRun`, legal lifecycle transitions, run history |
| `/api/agent-os/events` | Agent OS backend | durable `RunEvent` records and runtime evidence projection |
| `/api/agent-os/artifacts*` | Agent OS backend | artifacts, PR links, previews, verification evidence |
| `/api/agent-os/approvals*` | Agent OS backend | PM-visible approval state and approval lifecycle events |
| `/api/agent-os/memory*` | Agent OS backend | memory candidates, accepted memory, reviewer provenance |
| `/api/agent-os/work-locks*` | Agent OS backend | write ownership locks and conflict decisions |
| `/api/agent-os/policies/decisions` | Agent OS backend | canonical `PolicyDecision` records and approval ingress |
| `/api/agent-os/oss*` | Agent OS backend | OSS component contracts, canonical-state owners, risk findings |
| `/api/mcp*` | Agent MCP host | MCP discovery and pre-execution policy/audit checks |
| `/api/a2a*` | A2A compatibility adapter | transport ingress projected into Agent OS state |
| PM approval actions | Recoder PM | user/operator action surface; writes through Agent OS approval routes |
| Agents Agent OS page | recoder-agents | read UI; consumes Agent OS summary/control-plane APIs |
| Agency orchestration | recoder-agency | workflow initiator; writes task/run intent through Agent OS routes |

## Compatibility Rules

- A2A routes may create or update work only by projecting into Agent OS task, run, artifact, runtime evidence, and history records.
- MCP routes may expose discovery and pre-execution checks, but tool policy outcomes must be represented as `PolicyDecision` plus an audit event before execution.
- PM and Agents UI routes are not canonical state owners. They call Agent OS routes for approvals, summaries, artifacts, memory, and history.
- Runtime adapters own execution mechanics only. They do not own task state, approval state, memory state, route decisions, or delivery history.
- Legacy project/runtime routes can remain during migration, but new paid-user delivery work should land on the Agent OS route family first.

## Open Migration Notes

- Retired `recoder-web` route references remain approval-gated cleanup work under `recoder-26j7`.
- Production verification must still prove the paid-user path uses these owners end to end across task, A2A, runtime events, artifacts, PR, preview, approval, and memory.
