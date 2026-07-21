/**
 * `pal-route.adapter.ts` — the thin inference adapter that satisfies the
 * inference-owned `PalRoutePlannerPort` by delegating to the engines-owned
 * `PalBrainService` facet (`routeModel()`). This is the fusion seam: the routing
 * BRAIN now lives once, behind the facet in the engines domain, and inference
 * consumes it here — WITHOUT a direct pal-engine-package import (§7 grep gate).
 *
 * The facet's `PalRouteDecision.category`/`.risk` are pal-engine-typed string
 * unions; they assign STRUCTURALLY to the inference-local `RouteModelCategory` /
 * `RouteRisk` mirrors (identical members — pinned by `pal-route.parity.test.ts`),
 * so no cast is needed and no pal type crosses the domain boundary.
 *
 * Degrade contract (delegated to the facet, preserved here): when pal declines
 * (`source:'default'` — empty catalog / off-catalog pick / internal fault) the
 * facet leaves `model` empty; this adapter substitutes the caller's
 * `requestedModel` so the ladder routes exactly as supplied. Never fabricates an
 * off-catalog id; never throws.
 */
import type { PalBrainService } from '../../engines/ports/pal-brain.port.js';
import type { PalRoutePlannerPort, RouteDecision } from '../ports/pal-route.port.js';

/**
 * Build the inference routing planner over the engines pal facet. Injected by
 * bootstrap as `inference.setPalRouter(createInferenceRoutePalAdapter(engines.pal()))`.
 */
export function createInferenceRoutePalAdapter(pal: PalBrainService): PalRoutePlannerPort {
  return {
    plan(hint, models, requestedModel): RouteDecision {
      const d = pal.routeModel(
        {
          intent: hint.intent,
          title: hint.title,
          goal: hint.goal,
          taskId: hint.taskId,
          taskSpec: hint.taskSpec,
        },
        models.map((m) => ({ provider: m.provider, modelId: m.modelId })),
      );
      // The facet's `category`/`risk` are pal-typed strings that assign to the
      // inference-local unions (identical members — see the parity guard).
      const base = {
        preferDirect: d.preferDirect,
        intent: d.intent,
        category: d.category,
        risk: d.risk,
      } as const;
      return d.source === 'pal'
        ? { ...base, model: d.model, source: 'pal', reason: d.reason }
        : { ...base, model: requestedModel, source: 'default', reason: d.reason };
    },
  };
}
