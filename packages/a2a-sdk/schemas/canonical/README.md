# Canonical A2A schema (vendored)

`a2a.proto` is vendored verbatim from the upstream Agent2Agent (A2A) protocol
specification (`A2A/specification/a2a.proto` in this monorepo, which mirrors
[a2aproject/A2A](https://github.com/a2aproject/A2A)). It is the **source of truth**
for cross-agent interop field names.

It is intentionally NOT generated into Zod/TS here. Recoder's `packages/a2a-sdk`
schemas are a Recoder-domain layer that maps onto — but does not 1:1 mirror — the
canonical wire shapes. The relationship is enforced, not assumed:

- `src/canonical-conformance.test.ts` parses this proto and asserts the canonical
  `AgentCard` / `AgentSkill` field sets exactly match a **declared mapping** to
  Recoder fields (`canonical field -> recoder field | null-for-intentional-gap`).
- When upstream A2A adds or removes a field, the test fails until the mapping is
  consciously updated — drift on the interop contract can never land silently.

## Updating

1. Refresh `A2A/specification/a2a.proto` from upstream.
2. `cp -f A2A/specification/a2a.proto packages/a2a-sdk/schemas/canonical/a2a.proto`
3. Run `pnpm --dir packages/a2a-sdk test`; update the mapping in
   `canonical-conformance.test.ts` for any added/removed/renamed canonical fields.
