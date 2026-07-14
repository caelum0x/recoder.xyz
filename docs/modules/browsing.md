# BROWSING module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): modules/browsing/browser-use + @recoder/agent-browser

**Interface:** `open · snapshot · extract · verify · navigate · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../docs/RECODER-MODULES.md §BROWSING.
