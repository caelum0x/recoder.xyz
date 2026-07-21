/**
 * `pal-route.port.ts` — the inference-owned CONTRACT the delivery ladder consults
 * before dispatch: given a caller's task-intent `RoutingHint` + the enabled model
 * catalog, a `PalRoutePlannerPort` picks the provider/model (and the rung —
 * `preferDirect`) by INTENT, instead of taking the caller's `model` verbatim.
 *
 * The routing BRAIN itself no longer lives here. It was relocated behind the
 * engines-owned `PalBrainService` facet (`engines/pal-brain/pal-brain.service.ts`
 * `routeModel()`), and this domain consumes it through `pal-route.adapter.ts`.
 * That decouple is the whole point: the inference domain takes NO direct
 * pal-engine-package import (§7 grep gate) — instead it re-declares pal's two
 * string unions LOCALLY.
 *
 * `RouteRisk` / `RouteModelCategory` are byte-identical copies of pal's
 * `RiskLevel` (`packages/pal/src/risk-model.ts`) and `ToolModelCategory`
 * (`packages/pal/src/tool-model-category.ts`). They are plain string-literal
 * unions in pal, so the copy is lossless; a compile-time parity guard
 * (`pal-route.parity.test.ts`) pins them against the facet's pal-engine-typed
 * fields so they can never silently drift from the engine.
 */
import type { TaskIntent } from '@recoder/agent-os';
import type { ModelCatalogEntry, RoutingHint } from '../types.js';

/** Inference-local mirror of pal's `RiskLevel` — copied by value (no pal import). */
export type RouteRisk = 'low' | 'medium' | 'high';
/** Inference-local mirror of pal's `ToolModelCategory` — copied by value (no pal import). */
export type RouteModelCategory = 'extended_reasoning' | 'fast_response' | 'balanced';

/** The routing decision the brain returns for one request. */
export interface RouteDecision {
  /** The model id the ladder should route (always a routable catalog id, or the request's). */
  readonly model: string;
  /** Route the direct BYOK rung FIRST (set for high-risk plans). */
  readonly preferDirect: boolean;
  /** The intent pal classified the task as. */
  readonly intent: TaskIntent;
  /** The model category the intent/risk mapped to (inference-local mirror of pal's). */
  readonly category: RouteModelCategory;
  /** pal's estimated risk level for the task (inference-local mirror of pal's). */
  readonly risk: RouteRisk;
  /** `pal` when pal chose the model; `default` when it degraded to the request's model. */
  readonly source: 'pal' | 'default';
  /** Truthful one-line rationale (never leaks anything sensitive). */
  readonly reason: string;
}

/** The seam the routing service consults before dispatch (absent ⇒ route as-is). */
export interface PalRoutePlannerPort {
  /**
   * Compute a route decision for one request. `requestedModel` is the caller's
   * `model` (the degrade target); `models` is the enabled catalog to pick from.
   * PURE + total: never throws.
   */
  plan(
    hint: RoutingHint,
    models: readonly ModelCatalogEntry[],
    requestedModel: string,
  ): RouteDecision;
}
