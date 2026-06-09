---
name: recoder-platform
description: Use when implementing Recoder Agent OS tasks that involve task specs, instruction bundles, runtime adapters, policy gates, approvals, artifacts, verification, or memory candidates.
---

# Recoder Platform Skill

Use this skill for Agent OS work. Keep the product boundary simple: Recoder owns state and trust; runtimes execute work.

## Workflow

1. Start from a Recoder task spec, not a long ad-hoc prompt.
2. Identify the affected Agent OS layer: domain, A2A, instructions, runtime, policy, events, memory, workflow, MCP, UI, or docs.
3. Preserve provenance for instructions, memory, artifacts, and verification output.
4. Enforce policy through hooks/contracts/server checks, not only through wording.
5. Add focused contract coverage for new Agent OS behavior.
6. Emit a delivery summary that states verification run and residual gaps.

## Defaults

- Use `AGENTS.md` as canonical repo policy.
- Use `CLAUDE.md` only for Claude-specific behavior.
- Keep memory writes reviewable through memory candidates.
- Require approval before branch push, pull request creation, security-sensitive edits, and deployment unless policy explicitly allows them.
- Avoid broad root quality gates unless the task specifically asks for them.

## References

- `task-spec-template.yaml`
- `verification-playbook.md`
- `delivery-summary-template.md`
- `memory-candidate-template.json`
- `scripts/load-task.ts`
- `scripts/emit-artifact.ts`
- `scripts/verify-run.ts`
