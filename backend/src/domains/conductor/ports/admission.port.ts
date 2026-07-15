/**
 * AdmissionPort — the resource-governor seam.
 *
 * REUSE: re-exports the `@recoder/substrate` port verbatim. Before launching a
 * workspace the engine asks the resource governor whether a new workspace can be
 * admitted under the current parallelism / disk / session budget (the caps now
 * live in `config.ts::caps`). A refusal short-circuits the engine to `failed`
 * with the truthful reason — it never silently over-admits and exhausts the host.
 */
export type { AdmissionPort, AdmissionDecision } from '@recoder/substrate';
