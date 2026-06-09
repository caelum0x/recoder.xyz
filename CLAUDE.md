# Recoder Claude Code Instructions

@AGENTS.md
@.claude/rules/agent-os.md
@.claude/rules/security.md
@.claude/rules/testing.md
@.claude/rules/monorepo.md
@.claude/rules/api.md
@.claude/rules/frontend.md
@.claude/rules/production.md

## Claude-Specific Rules

- Prefer Recoder task specs, skills, hooks, and verification plans over open-ended prompt chains.
- Use `.claude/skills/recoder-platform` for Agent OS implementation and handoff work.
- Use subagents for read-heavy investigation unless the task or policy grants a write lock.
- Do not write durable memory directly. Produce a memory candidate artifact with evidence.
- Keep health, approval, and verification status truthful. Never imply success without evidence.
