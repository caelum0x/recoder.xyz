/**
 * `pal-route-planner.test.ts` — proves the pal routing BRAIN genuinely consults
 * `@recoder/pal` (real `classifyTaskIntent` + `computePalPlanDecision` +
 * `getPreferredFallbackModel`) to pick the model/rung by task INTENT, and that it
 * degrades TRUTHFULLY (never off-catalog, never throwing) when pal can't help.
 */
import { describe, it, expect } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { ModelCatalogEntry } from '../types.js';
import { createPalRoutePlanner } from './pal-route-planner.js';

const log = { info() {}, warn() {}, error() {}, debug() {} } as unknown as Logger;

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

describe('createPalRoutePlanner', () => {
  const planner = createPalRoutePlanner({ logger: log });

  it('routes a fast-response intent (documentation) to a mini/flash model', () => {
    const d = planner.plan({ intent: 'documentation', title: 'update readme' }, CATALOG, 'openai/gpt-4o');
    expect(d.source).toBe('pal');
    expect(d.intent).toBe('documentation');
    expect(d.category).toBe('fast_response');
    expect(d.model).toBe('openai/gpt-4o-mini');
    expect(d.preferDirect).toBe(false);
  });

  it('routes a deep-reasoning intent (bugfix) to a reasoning-class model', () => {
    const d = planner.plan({ intent: 'bugfix', title: 'fix crash' }, CATALOG, 'openai/gpt-4o-mini');
    expect(d.source).toBe('pal');
    expect(d.category).toBe('extended_reasoning');
    // openai has no reasoning-preferred model, so pal's picker falls to the
    // provider that does (anthropic/claude-sonnet-4).
    expect(d.model).toBe('anthropic/claude-sonnet-4');
  });

  it('escalates a HIGH-risk task (auth path) to extended_reasoning + the direct rung', () => {
    const d = planner.plan(
      { taskSpec: { taskId: 't-1', intent: 'feature_delivery', targetPaths: ['backend/src/auth/session.ts'] } },
      CATALOG,
      'openai/gpt-4o-mini',
    );
    expect(d.risk).toBe('high');
    expect(d.category).toBe('extended_reasoning');
    expect(d.preferDirect).toBe(true);
    expect(d.model).toBe('anthropic/claude-sonnet-4');
  });

  it('degrades to the requested model (never off-catalog) when the catalog is empty', () => {
    const d = planner.plan({ intent: 'bugfix' }, [], 'openai/gpt-4o-mini');
    expect(d.source).toBe('default');
    expect(d.model).toBe('openai/gpt-4o-mini');
  });

  it('keeps the requested model for a balanced intent with no reasoning/fast catalog match', () => {
    const d = planner.plan({ intent: 'feature_delivery' }, [entry('openai/gpt-4o', 'openai')], 'openai/gpt-4o');
    // balanced ⇒ pal returns the first-available (the only) model; still routable.
    expect(d.category).toBe('balanced');
    expect(d.model).toBe('openai/gpt-4o');
  });
});
