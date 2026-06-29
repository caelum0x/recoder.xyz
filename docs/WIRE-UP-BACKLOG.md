# Recoder — Wire-Up Backlog

> The built-but-**unused** first-party code: real, tested packages that exist but
> nothing in the product imports yet. "Using all the folders in the product"
> *means working this list.* From [`DIRECTORY-MAP.md`](./DIRECTORY-MAP.md) (15
> wire-up dirs of 129). Ordered by leverage. Check a box only when the consumer
> actually imports + runs it end-to-end.

Status: ⬜ todo · 🔄 in progress · ✅ wired (consumer imports + runs it)

| | Package (built, unused) | Wire into (consumer) | Why it matters |
|---|--------------------------|----------------------|----------------|
| ⬜ | **`packages/pal`** | `docker-backend` conductor run loop | **highest** — the multi-model/agent tool layer the run loop should call; biggest unused first-party asset |
| ⬜ | **`apps/agent-gateway`** | fold into / import from `docker-backend` (kill the inline re-impl) | the A2A ingress is re-implemented inline in the backend; one path, not two |
| ⬜ | **`apps/agent-worker`** | `docker-backend` container (scale-out worker) | the headless runtime worker; backend re-implements it inline |
| ⬜ | **`packages/agent-workflows`** | `docker-backend` (workflow driver) | declarative multi-step agent workflows — unused |
| ⬜ | **`packages/agent-hooks`** | `docker-backend` lifecycle (pre/post action hooks) | deterministic policy/artifact hooks around runs |
| ⬜ | **`packages/agent-schemas`** | `docker-backend` request/response validation | shared schemas not yet enforced at the boundary |
| ⬜ | **`packages/beads-adapter`** | `agent-os` task store ↔ `bd`/beads | sync canonical tasks with the issue tracker |
| ⬜ | **`packages/conductor-ui`** | `apps/desktop/cockpit` | the typed conductor client/components — reuse in the cockpit instead of bespoke wiring |
| ⬜ | **`packages/agent-oss`** | `packages/runtime` dispatch | the OSS-engine dispatch layer |
| ⬜ | **`py/ops-recorder`** | `/work-signals` ingress (docker-backend) | stuck-work detection → handoff; built, gitignored, unconsumed |
| ⬜ | **`packages/document-preprocessor`** | `packages/brain` RAG ingest | preprocess docs for the shared brain |
| ⬜ | **`packages/browser-verification`** | a browser-check node in the run loop | verify an agent's web output (preview health) |
| ⬜ | **`packages/recoder-browser-tools`** | the browser-check node / agent tools | browser tooling for agents |
| ⬜ | **`packages/design-tokens`** | `apps/desktop/cockpit` + `site` | one design system across surfaces |
| ⬜ | **`shared/src/animations`** | `apps/desktop/cockpit` | shared motion in the cockpit |

## How to work this list
- Each wire-up is a small PR: import the package at the named consumer, replace the
  bespoke/inline path, add a test proving the consumer uses it, commit.
- Do these in **parallel disjoint workflows** (different consumer trees) — but never
  two on the same consumer at once.
- After a wire-up, flip its `DIRECTORY-MAP.md` verdict to `keep-supporting` and check
  the box here.
- **#1 `pal` → the run loop is the headline**: it's the largest first-party package
  the shipping product doesn't touch.

## Not on this list (handled elsewhere)
- **Park** (43 dirs): vendored forks/clones (`ts/oh-my-*`, `openfang`, `lance`,
  `tensorzero`, `polar`, the Giselle/agency subtree) → move under a labeled
  `vendor/` area; see DIRECTORY-MAP §park.
- **Drop** (5 dirs): `app/` slice (can't build), `packages/{ui,performance,plugins}`,
  `py/colbert` — zero-import / non-building; see DIRECTORY-MAP §drop.
