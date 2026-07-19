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

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../docs/RECODER-MODULES.md §SQUADS.
