# Beads Task Graph

Beads is the repo-local task graph. It is useful for offline continuity, dependency-aware issue tracking, and agent handoff notes.

Package:

- `packages/beads-adapter`

Scripts:

- `pnpm beads:sync`
- `pnpm beads:task:create`
- `pnpm beads:task:status`

Mapping:

- Beads issue -> `TaskSpec`
- Beads dependency -> task dependency or workflow edge
- Beads status -> Recoder task status
- Beads comments/artifacts -> run history references

Beads does not own Recoder run state. It synchronizes with it.
