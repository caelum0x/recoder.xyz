# Claude Code And Codex

Claude Code and Codex are runtimes. They are not the control plane.

## Claude Code

Use Claude Code for larger implementation and skill-driven work.

Inputs:

- `CLAUDE.md`
- `AGENTS.md`
- `.claude/rules/*`
- `.claude/skills/recoder-platform/*`
- Recoder MCP tools

Claude-specific rule: do not write durable memory directly. Produce memory candidate artifacts.

## Codex

Use Codex for patching, review, investigation, and verification-heavy tasks.

Inputs:

- `AGENTS.md`
- `.codex/AGENTS.md`
- `.codex/config.toml`
- `.codex/hooks/*`

Codex hooks are guardrails, not the complete enforcement layer. Server-side Recoder policy remains required.
