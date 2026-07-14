# TERMINAL module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): modules/terminal/tmux + ts/dmux

**Interface:** `createSession · attach · panes · layout · attention · send · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../docs/RECODER-MODULES.md §TERMINAL.
