# TERMINAL module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): apps/desktop/engines/tmux + apps/desktop/engines/dmux

> **SHIPPED (this substrate lives inside the CONDUCTOR domain).** There is no
> standalone `terminal` domain. The terminal substrate ships at
> `backend/src/domains/conductor/terminal/` — a package-compatible tmux
> `ConductorSubstrate` with a **tmux control-mode observer** and real-time
> terminal streaming (`terminal-stream`), driving conductor `steer` (send-keys)
> and the run-screen plane. **Still partial:** the attention classifier is wired,
> but dmux's fuller pane/layout/streaming/worker brain remains the deepening
> target. See `../RECODER-MODULES.md` §4 TERMINAL.

**Interface:** `createSession · attach · panes · layout · attention · send · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../RECODER-MODULES.md §TERMINAL.
