# Security

Security has three layers: instruction guidance, runtime guardrails, and Recoder server-side enforcement.

Prompts, `AGENTS.md`, `CLAUDE.md`, skills, and hooks guide behavior. Work locks, policy decisions, signed envelopes, approval gates, secret rules, and artifact requirements enforce behavior.

`WorkLockService` is the storage-agnostic domain helper for write ownership. Runtimes, hooks, and MCP routers should acquire a lock before write-heavy work, pass active locks into policy evaluation, and release the lock when the run finishes or is cancelled.

Hook lifecycle coverage should include pre-tool policy, post-tool artifact capture, before-compact run-state capture, subagent-stop parent-run summaries, and stop-time memory candidate extraction. Memory candidates without task and artifact evidence are dropped instead of becoming invisible model memory.
