# SQUADS module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): apps/desktop/server/engines/multica (ported into conductor)

> **SHIPPED POSTURE: read-only introspection** (owner decision). The squads surface
> exposes only READ edges — `GET /api/agent-os/squads/*` (`squad-read.routes.ts`) and
> the board (`squad-board.routes.ts`); there are **no mutating squad MCP tools**. The
> `createSquad`/`assign`/`autopilot` verbs exist as internal service methods
> (`squad.service.ts` / `squad-autopilot.service.ts`) but are not surfaced as agent-callable
> mutations. Adding mutating tools would be NEW work.

**Interface (read-only surface):** `listSquads · squadDetail · board · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../docs/RECODER-MODULES.md §SQUADS.
