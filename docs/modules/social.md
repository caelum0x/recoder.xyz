# SOCIAL module

**Shipped** — lives at `backend/src/domains/social/` and mounts at `/api/social` (NOT `/api/connectors`).

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): apps/desktop/engines/openclaw (connectors)

**Interface:** `channels · bindings · send · onInbound · dispatchToConductor · webhooks · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../docs/RECODER-MODULES.md §SOCIAL.
