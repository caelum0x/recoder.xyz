# Prompt Itself

Manual prompting is a fallback. The product path is:

```text
intent -> TaskSpec -> ContextPack -> PALPlan -> InstructionBundle -> runtime -> verification -> artifacts -> memory candidate
```

The compiler loads AGENTS.md, Claude/Codex overrides, skills, Beads context, Git Nexus context, PAL routing, policy decisions, memory refs, MCP grants, and verification requirements. It then renders runtime-specific prompts for Claude Code, Codex, Recoder Code, or another adapter.

`compileAgentOsInstructionBundle` is the bridge from domain state to runtime dispatch. It accepts the Agent OS `TaskSpec` and `AgentProfile`, optional Git Nexus `ContextPack` and PAL plan data, reuses the A2A instruction compiler for the audited bundle, then maps the result into the runtime-ready Agent OS `InstructionBundle` consumed by runtime adapters.

Every generated bundle must preserve provenance:

- instruction source refs and hashes
- task spec id/version
- context pack refs
- PAL plan refs
- memory refs
- allowed and denied tools
- approval gates
- verification commands

This makes the prompt an audited artifact rather than disposable chat text.
