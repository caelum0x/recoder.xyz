# SIGNALS module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): backend/engines/py/ops-recorder

**Interface:** `ingest · query · onSignal · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../docs/RECODER-MODULES.md §SIGNALS.
