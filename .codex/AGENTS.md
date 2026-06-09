# Recoder Codex Instructions

Read `../AGENTS.md` as the canonical policy for this repo.

## Codex-Specific Rules

- Start multi-file work with a short plan and keep it current.
- Prefer read-only subagents for investigation.
- Do not run write-heavy parallel agents on the same files or path group.
- Use task-spec verification commands as mandatory exit criteria, not optional suggestions.
- Do not write durable memory directly. Produce a memory candidate artifact with evidence.
- Use `.codex/hooks/*` for deterministic Agent OS policy/artifact/memory gates.
- Keep personal runtime settings in local `.codex/config.toml`; use `.codex/config.example.toml` as the tracked Agent OS hook template.
