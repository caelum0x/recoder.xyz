# MEMORY module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): backend/engines/py/mem0 + apps/desktop/server/engines/beads (dolt) + backend/engines/py/colbert

**Interface:** `recall (fuse+rerank) · remember · promote · forget · relate · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../docs/RECODER-MODULES.md §MEMORY.
