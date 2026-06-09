# Agent OS Verification

Use the verification plan from the Recoder task spec when one exists.

Default verification strategy:

- Run the narrowest check that proves the changed behavior.
- Prefer focused package tests or contract tests over broad monorepo gates during active implementation.
- Capture verification commands and outputs as artifacts for orchestrated runs.
- Do not claim success from implementation alone; cite passing verification or state what was not run.
- If a broad gate is known broken for unrelated reasons, file or update a bd issue instead of hiding the failure.

For Agent OS work, the preferred focused checks are:

```bash
pnpm agent:instructions:check
pnpm test:contracts:agent-os
pnpm test:evals:agent-os
```
