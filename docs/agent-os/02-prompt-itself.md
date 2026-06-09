# Prompt Itself

Manual prompting is the fallback path. The default path is compiled instructions.

```text
Human / Beads / GitHub / Slack / PM input
  -> Recoder TaskSpec
  -> Beads dependencies
  -> Git Nexus context pack
  -> PAL plan
  -> policy and MCP grants
  -> memory refs
  -> runtime-specific InstructionBundle
```

The instruction compiler lives in `packages/agent-instructions`.

## Inputs

- `AGENTS.md`
- `CLAUDE.md`
- `.codex/AGENTS.md`
- Recoder task spec
- Beads task graph
- Git Nexus context pack
- PAL plan
- path rules
- memory refs
- policy decisions
- verification plan
- runtime capabilities

## Outputs

- shared goal
- rendered prompt
- acceptance criteria
- verification commands
- forbidden actions
- approval gates
- memory references
- source refs and hashes
- compiler version and timestamp

Every run should store the compiled bundle as an artifact so PM, Agency, and audits can answer what the agent knew and what it was allowed to do.
