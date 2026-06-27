# @recoder/runtime

The Recoder **Runtime** subsystem. It drives the user's own coding-agent CLIs
(Claude Code, OpenAI Codex, opencode, pi, plus in-process agents) headless behind one
uniform driver contract and streams every byte of their work back to the control plane as
`RunEvent` records.

This package is the real implementation behind the `AgentRuntimeAdapter` factory shells in
`@recoder/agent-runtimes`. It is an **execution surface**, not a state-of-record: canonical
task/approval/memory/artifact state lives in `@recoder/agent-os`. The runtime only *emits*
`RunEvent`s and *consumes* `TaskSpec` + `InstructionBundle` + `RuntimePolicy`.

See `docs/subsystems/runtime.md` for the full architecture, file tree, fusion map, and
verification plan.

## Status

**Foundation landed.** The uniform engine, adapter skin, registry, driver SPI, shared
driver machinery, policy enforcement, event sinks, errors, config, and typed seams are in
place. The per-CLI drivers under `src/drivers/<surface>/` are landed separately by the
driver agents against this foundation.

## Public surface

```ts
import { createRuntime, createRuntimeAdapter } from '@recoder/runtime';
import type { RuntimeDriver, DriverContext, DriverFrame } from '@recoder/runtime';

const runtime = createRuntime({ drivers: [/* concrete drivers */] });
const adapter = runtime.adapterFor('codex'); // -> AgentRuntimeAdapter
```

A driver implements the frame-oriented `RuntimeDriver` SPI; the engine handles
normalization, policy gates, redaction, the exactly-one-terminal invariant, cancellation,
deadlines, backpressure, and concurrency.

## Verification

```bash
pnpm --filter @recoder/runtime check-types
pnpm --filter @recoder/runtime test
pnpm --filter @recoder/runtime build
```
