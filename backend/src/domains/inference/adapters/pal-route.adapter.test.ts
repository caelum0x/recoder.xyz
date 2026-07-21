/**
 * `pal-route.adapter.test.ts` — proves the inference routing planner now runs
 * THROUGH the engines-owned `PalBrainService` facet (via a fake facet), not the
 * deleted in-domain brain: the adapter forwards the caller's `RoutingHint` + the
 * catalog into `pal.routeModel()`, surfaces the pal-chosen model on `source:'pal'`,
 * and degrades to the caller's `requestedModel` on `source:'default'` (the facet
 * leaves `model` empty on decline). NO pal-engine-package import in this domain.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ModelCatalogEntry } from '../types.js';
import type {
  PalBrainService,
  PalCatalogModel,
  PalRouteDecision,
  PalRoutingHint,
} from '../../engines/ports/pal-brain.port.js';
import { createInferenceRoutePalAdapter } from './pal-route.adapter.js';

function entry(modelId: string, provider: string): ModelCatalogEntry {
  return {
    modelId,
    provider,
    displayName: modelId,
    contextWindow: 128000,
    inputMicroUsdPerMTok: 0,
    outputMicroUsdPerMTok: 0,
    supportsStreaming: true,
    enabled: true,
    updatedAt: new Date().toISOString(),
  };
}

const CATALOG: ModelCatalogEntry[] = [
  entry('openai/gpt-4o', 'openai'),
  entry('openai/gpt-4o-mini', 'openai'),
  entry('anthropic/claude-sonnet-4', 'anthropic'),
];

/** Build a fake facet whose `routeModel` returns a fixed decision + records its args. */
function fakeFacet(decision: PalRouteDecision): {
  pal: PalBrainService;
  calls: Array<{ hint: PalRoutingHint; catalog: readonly PalCatalogModel[] }>;
} {
  const calls: Array<{ hint: PalRoutingHint; catalog: readonly PalCatalogModel[] }> = [];
  const routeModel = vi.fn((hint: PalRoutingHint, catalog: readonly PalCatalogModel[]) => {
    calls.push({ hint, catalog });
    return decision;
  });
  const pal = { routeModel } as unknown as PalBrainService;
  return { pal, calls };
}

describe('createInferenceRoutePalAdapter', () => {
  it('surfaces the pal-chosen model on a `pal` decision', () => {
    const { pal } = fakeFacet({
      model: 'openai/gpt-4o-mini',
      preferDirect: false,
      intent: 'documentation',
      category: 'fast_response',
      risk: 'low',
      source: 'pal',
      reason: 'pal routed documentation/low→fast_response to openai/gpt-4o-mini',
    });
    const planner = createInferenceRoutePalAdapter(pal);
    const d = planner.plan({ intent: 'documentation', title: 'update readme' }, CATALOG, 'openai/gpt-4o');
    expect(d.source).toBe('pal');
    expect(d.model).toBe('openai/gpt-4o-mini');
    expect(d.category).toBe('fast_response');
    expect(d.risk).toBe('low');
    expect(d.intent).toBe('documentation');
    expect(d.preferDirect).toBe(false);
  });

  it('carries the high-risk direct-rung escalation through untouched', () => {
    const { pal } = fakeFacet({
      model: 'anthropic/claude-sonnet-4',
      preferDirect: true,
      intent: 'feature_delivery',
      category: 'extended_reasoning',
      risk: 'high',
      source: 'pal',
      reason: 'pal routed feature_delivery/high→extended_reasoning to anthropic/claude-sonnet-4 (direct rung)',
    });
    const planner = createInferenceRoutePalAdapter(pal);
    const d = planner.plan({ intent: 'feature_delivery' }, CATALOG, 'openai/gpt-4o-mini');
    expect(d.risk).toBe('high');
    expect(d.category).toBe('extended_reasoning');
    expect(d.preferDirect).toBe(true);
    expect(d.model).toBe('anthropic/claude-sonnet-4');
  });

  it('degrades to the caller model on a `default` decision (facet left model empty)', () => {
    const { pal } = fakeFacet({
      model: '',
      preferDirect: false,
      intent: 'bugfix',
      category: 'extended_reasoning',
      risk: 'medium',
      source: 'default',
      reason: 'pal(bugfix/medium) but catalog empty — caller keeps its model',
    });
    const planner = createInferenceRoutePalAdapter(pal);
    const d = planner.plan({ intent: 'bugfix' }, [], 'openai/gpt-4o-mini');
    expect(d.source).toBe('default');
    expect(d.model).toBe('openai/gpt-4o-mini');
    // The advisory intent/category/risk still ride through on a decline.
    expect(d.category).toBe('extended_reasoning');
    expect(d.risk).toBe('medium');
  });

  it('forwards the loose hint fields + catalog (provider/modelId) into the facet', () => {
    const { pal, calls } = fakeFacet({
      model: 'openai/gpt-4o',
      preferDirect: false,
      intent: 'feature_delivery',
      category: 'balanced',
      risk: 'low',
      source: 'pal',
      reason: 'ok',
    });
    const planner = createInferenceRoutePalAdapter(pal);
    planner.plan(
      { intent: 'feature_delivery', title: 't', goal: 'g', taskId: 'x-1', taskSpec: { taskId: 'x-1' } },
      [entry('openai/gpt-4o', 'openai')],
      'openai/gpt-4o',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.hint).toEqual({
      intent: 'feature_delivery',
      title: 't',
      goal: 'g',
      taskId: 'x-1',
      taskSpec: { taskId: 'x-1' },
    });
    expect(calls[0]!.catalog).toEqual([{ provider: 'openai', modelId: 'openai/gpt-4o' }]);
  });
});
