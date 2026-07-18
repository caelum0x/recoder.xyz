# AGENT-ENGINE module

**Domain owner.** Uses the OSS engine(s) **in place** (never copied): backend/engines/rust/openfang

**Interface:** `asRuntime · hands · activateHand · run · onEvent · health`

**Rule:** this module drives the real engine(s) directly and exposes ONE cohesive,
governed, health-truthful interface to the backend. Depth lives in the engine dirs;
this folder owns the composition + interface. Degrade-safe: any engine down → that
facet reports down, never fakes success. See ../RECODER-MODULES.md §AGENT-ENGINE.

**Shipped (2026-07-18):** this facet lives inside `backend/src/domains/engines/`, not a
standalone `agent-engine` domain. `openfang-native.ts` is a REAL in-process NAPI loader
(~51 `#[napi]` methods on the booted kernel: `runAgent`, `activateHand`/`listActiveHands`,
`health`, …) and `openfang-runtime.ts` (`launchOpenfangRun`) drives an in-process agent
turn that emits honest RunEvents — so `run`, `hands`, `activateHand`, and `health` are
live. The `.node` addon is **disk-gated / not built by default**, so it degrades truthfully
to `undefined` when absent (no fake success). Still **planned**: `asRuntime` dispatch (the
driver exists as `IN_PROCESS_RUNTIME_SPECS`, but `ConductorRuntimeId` is a closed union so
it is not yet dispatchable) and the bidirectional `onEvent` openfang-event-bus ↔ RunEvent
bridge (the RunEvent sink is one-way and its bootstrap DI wiring is still a TODO).
