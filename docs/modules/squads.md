# SQUADS module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): apps/desktop/server/engines/multica (leader-routing + autopilot logic ported into the **agent-os** domain — `backend/src/domains/agent-os/services/squad.service.ts` + `squad-autopilot.service.ts`; the autopilot dispatches to the conductor)

> **SHIPPED POSTURE: read-only introspection** (owner decision). The squads surface
> exposes only READ edges — `GET /api/agent-os/squads/*` (`squad-read.routes.ts`) and
> the board (`squad-board.routes.ts`); there are **no mutating squad MCP tools**. The
> `createSquad`/`assign`/`autopilot` verbs exist as internal service methods
> (`squad.service.ts` / `squad-autopilot.service.ts`) but are not surfaced as agent-callable
> mutations. Adding mutating tools would be NEW work.

**Interface (read-only surface):** `listSquads · squadDetail · board · health`

## Multica coordination MCP tools (SHIPPED)

The multica engine now backs a cohesive set of **agent-callable coordination tools**
(agent-os namespace), all real-bound and degrade-truthful — any engine facet down
reports down, never fakes success. Three are read edges; the reroute is
**approval-gated** (a mutation, not surfaced as an ungoverned squad verb):

- **`coordination_squad_routing`** *(read, SHIPPED)* — leader/member routing map for a
  squad (who owns which lane; how the autopilot dispatches to the conductor).
- **`coordination_status`** *(read, SHIPPED)* — live coordination state across the squad
  (active assignments, lane occupancy, autopilot posture).
- **`coordination_conflicts`** *(read, SHIPPED)* — detected routing/lane conflicts
  (overlapping ownership, contended work) surfaced for review.
- **`coordination_request_reroute`** *(gated mutation, SHIPPED)* — request a routing change;
  passes through the governance gate before any dispatch shift lands. This is the first
  agent-callable squad mutation, and it is **approval-gated by design** — it does not
  bypass the read-only posture above; the CRUD verbs (`createSquad`/`assign`/`autopilot`)
  remain internal-only.

## Multica fusion posture (route + admission — SHIPPED, degrade-safe)

The multica engine's routing + coordination ideas are **ported into the backend
domains**, not run as a hard subprocess dependency. The Go squads binary / loopback
supervisor stays a **degrade-safe optional enrichment**, reached ONLY as an external
`MULTICA_URL` through `MulticaCoordinationAdapter` — absent ⇒ everything degrades open.
Two dark wiring hops were closed (items 19–20), both **opt-in / fail-open**:

- **Squad routing is opt-in via a squad seed.** `SquadService.route` was threaded
  end-to-end but sat over a never-seeded in-memory store, so a set `RECODER_SQUAD_ID`
  returned "squad not found" and the autopilot skipped every dispatch. Agent-os now
  runs an **opt-in** `seedSquad()` in `start()` (before the autopilot loop) driven by a
  zod-validated `squadSeed` config (default `null` = OFF; bootstrap parses it from
  `RECODER_SQUAD_DEF` json | `RECODER_SQUAD_ID`+`RECODER_SQUAD_MEMBERS` csv). Once
  seeded, `route()` genuinely selects a member (leader-first / weighted) and threads
  `routedAgentId` into the conductor launch. **DEFAULT OFF:** with no seed the autopilot
  is a byte-identical flat pass-through; a bare `squadId` with no seed degrades to
  pass-through with a truthful warn — never the skip-all footgun, never a fabricated
  route.
- **Coordination admission is consulted on `createWorkspace`, fail-open.** The conductor
  consults `CoordinationAdmissionService.admitIssue({issueId})` on the axis
  resource-governor → coordination-admission → work-lock → launch. A **live,
  engine-confirmed** double-assignment defers the launch truthfully (`ok:false`, audit
  `coordinationDeferred`) — not a governance deny; the reroute WRITE stays
  governance-gated (`coordination.reroute`). **FAIL-OPEN (load-bearing):** no
  `MULTICA_URL` / engine absent/unreachable/errored / no `taskId` / absent gate ⇒
  `admit:true, gated:false` ⇒ the launch proceeds untouched. A coordination engine being
  down NEVER blocks a launch; only a confirmed contention defers.

**Agent-facing MCP tools (governed): none.** The multica coordination surface is
engine-namespace only — `coordination_squad_routing` / `coordination_status` /
`coordination_conflicts` / `coordination_request_reroute` above. There is no public
`recoder_*` capability-bridge wrapper for them in `mcp/recoder-capability-tools.cjs`
(the `recoder_coordination_acquire_lock` / `_detect_conflict` bridge tools are the
governance *workLocks* facet — see governance.md — not these squad verbs). Adding a
`recoder_squad_*` tool would be new work.

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../docs/RECODER-MODULES.md §SQUADS.
