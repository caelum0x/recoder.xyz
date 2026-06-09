# Recoder Claude Bridge

This folder is the Claude Code bridge boundary.

Claude Code consumes:

- `CLAUDE.md`
- `.claude/rules/*`
- `.claude/skills/recoder-platform/*`
- Recoder MCP tools
- Recoder approval and artifact hooks

Claude-specific behavior stays adapter-scoped. Recoder Agent OS owns `TaskSpec`, `InstructionBundle`, `RunEvent`, `Artifact`, `Approval`, `MemoryCandidate`, and `WorkLock`.
