# Verification Playbook

Use the task spec as the source of truth.

For instruction and control-plane work:

```bash
pnpm agent:instructions:check
pnpm test:contracts:agent-os
pnpm test:evals:agent-os
```

For runtime adapter work, prefer focused runtime contract tests before broad backend gates.

For hook or policy work:

- Smoke the hook with an allowed input.
- Smoke the hook with a denied input.
- Capture the policy decision and exit code.

For UI surfaces:

- Validate the component renders with representative online/offline agents.
- Capture policy, provenance, approval, verification, and artifact states.

If a broad monorepo gate fails for unrelated existing debt, link the bd issue that tracks it and keep the task delivery scoped.
