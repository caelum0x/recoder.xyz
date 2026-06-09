# Beads

Beads is the repo-local task graph. Recoder maps Beads issues to `TaskSpec`, dependencies to task edges, status to task state, comments to run summaries, and tags to intent/risk/runtime hints.

The adapter boundary is `packages/beads-adapter`; the MCP boundary is `recoder.beads.*`.

