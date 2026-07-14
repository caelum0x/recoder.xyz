/**
 * Table-driven parity tests for the decision logic ported from
 * backend/engines/py/pal-mcp-server (zen-mcp-server fork). Each expected value is
 * derived from the documented Python behavior cited in the source files.
 */
import { describe, expect, it } from 'vitest';

import {
  ESSENTIAL_TOOLS,
  PAL_MODEL_DEFAULTS,
  PAL_TOOL_MODEL_CATEGORIES,
  filterDisabledTools,
  getToolModelCategory,
  isAutoMode,
  type ToolModelCategory,
} from './tool-model-category';
import {
  PROVIDER_PRIORITY_ORDER,
  ULTIMATE_FALLBACK_MODEL,
  geminiPreferModel,
  getPreferredFallbackModel,
  preferFromOrderedList,
  type ProviderCatalog,
} from './model-router';
import {
  evaluatePlannerStep,
  getRequiredPlanningActions,
  needsDeepThinkingPause,
  registerPlannerBranch,
} from './planner-pacing';
import {
  CONFIDENCE_LEVELS,
  decideCompletion,
  isConfidenceAtLeast,
  isSpecialStatus,
  shouldSkipExpertAnalysis,
  type CompletionDecision,
  type ConfidenceLevel,
} from './expert-escalation';
import {
  DEFAULT_CONSENSUS_MAX_INSTANCES_PER_COMBINATION,
  consensusModelForStep,
  validateConsensusStep,
} from './consensus-rules';

describe('tool model categories (tools/*.py get_model_category parity)', () => {
  const cases: Array<[string, ToolModelCategory]> = [
    ['thinkdeep', 'extended_reasoning'],
    ['planner', 'extended_reasoning'],
    ['consensus', 'extended_reasoning'],
    ['debug', 'extended_reasoning'],
    ['codereview', 'extended_reasoning'],
    ['precommit', 'extended_reasoning'],
    ['secaudit', 'extended_reasoning'],
    ['docgen', 'extended_reasoning'],
    ['analyze', 'extended_reasoning'],
    ['refactor', 'extended_reasoning'],
    ['tracer', 'extended_reasoning'],
    ['testgen', 'extended_reasoning'],
    ['chat', 'fast_response'],
    ['apilookup', 'fast_response'],
    ['listmodels', 'fast_response'],
    ['version', 'fast_response'],
    ['challenge', 'fast_response'],
    ['clink', 'balanced'],
  ];

  it.each(cases)('%s → %s', (tool, expected) => {
    expect(getToolModelCategory(tool)).toBe(expected);
  });

  it('covers exactly the 18 server tools', () => {
    expect(Object.keys(PAL_TOOL_MODEL_CATEGORIES)).toHaveLength(18);
  });

  it('returns undefined for unknown tools', () => {
    expect(getToolModelCategory('not-a-tool')).toBeUndefined();
  });
});

describe('DISABLED_TOOLS filtering (server.py parity)', () => {
  const allTools = Object.keys(PAL_TOOL_MODEL_CATEGORIES);

  it('keeps every tool enabled when the env var is empty or undefined', () => {
    expect(filterDisabledTools(allTools, undefined).enabled).toEqual(allTools);
    expect(filterDisabledTools(allTools, '  ').enabled).toEqual(allTools);
  });

  it('disables listed tools but never essential tools', () => {
    const result = filterDisabledTools(allTools, 'chat, debug ,version');
    // `disabled` preserves tool-registry order (debug is registered before chat)
    expect([...result.disabled].sort()).toEqual(['chat', 'debug']);
    expect(result.enabled).toContain('version');
    expect(result.essentialKept).toEqual(['version']);
  });

  it('reports unknown tool names without failing', () => {
    const result = filterDisabledTools(allTools, 'nonexistent,chat');
    expect(result.unknown).toEqual(['nonexistent']);
    expect(result.disabled).toEqual(['chat']);
  });

  it('essential tools are version + listmodels', () => {
    expect([...ESSENTIAL_TOOLS].sort()).toEqual(['listmodels', 'version']);
  });
});

describe('config defaults (config.py parity)', () => {
  it('DEFAULT_MODEL is auto and auto-mode detection is case-insensitive', () => {
    expect(PAL_MODEL_DEFAULTS.defaultModel).toBe('auto');
    expect(isAutoMode()).toBe(true);
    expect(isAutoMode('AUTO')).toBe(true);
    expect(isAutoMode('gemini-2.5-pro')).toBe(false);
  });

  it('temperatures are 1.0 and thinkdeep defaults to high thinking', () => {
    expect(PAL_MODEL_DEFAULTS.temperatureAnalytical).toBe(1.0);
    expect(PAL_MODEL_DEFAULTS.temperatureBalanced).toBe(1.0);
    expect(PAL_MODEL_DEFAULTS.temperatureCreative).toBe(1.0);
    expect(PAL_MODEL_DEFAULTS.thinkdeepThinkingMode).toBe('high');
  });
});

describe('provider priority routing (providers/registry.py parity)', () => {
  it('priority order is google → openai → azure → xai → dial → custom → openrouter', () => {
    expect(PROVIDER_PRIORITY_ORDER).toEqual([
      'google',
      'openai',
      'azure',
      'xai',
      'dial',
      'custom',
      'openrouter',
    ]);
  });

  it('returns the ultimate fallback when no provider has models', () => {
    expect(getPreferredFallbackModel([], 'balanced')).toBe(ULTIMATE_FALLBACK_MODEL);
    expect(ULTIMATE_FALLBACK_MODEL).toBe('gemini-2.5-flash');
  });

  it('asks providers in priority order and returns the first preference', () => {
    const catalogs: ProviderCatalog[] = [
      {
        provider: 'openrouter',
        allowedModels: ['anything'],
        preferModel: () => 'openrouter-pick',
      },
      {
        provider: 'openai',
        allowedModels: ['gpt-5.2', 'o3'],
        preferModel: () => 'gpt-5.2',
      },
    ];
    expect(getPreferredFallbackModel(catalogs, 'fast_response')).toBe('gpt-5.2');
  });

  it('falls back to the sorted-first model of the first non-empty provider', () => {
    const catalogs: ProviderCatalog[] = [
      { provider: 'google', allowedModels: [] },
      { provider: 'xai', allowedModels: ['grok-4', 'grok-3'] },
      { provider: 'openrouter', allowedModels: ['zzz'], preferModel: () => undefined },
    ];
    // xai has no preference fn; first available = sorted()[0] = grok-3
    expect(getPreferredFallbackModel(catalogs)).toBe('grok-3');
  });

  it('defaults the category to balanced when omitted', () => {
    const seen: ToolModelCategory[] = [];
    const catalogs: ProviderCatalog[] = [
      {
        provider: 'google',
        allowedModels: ['gemini-2.5-flash'],
        preferModel: (category) => {
          seen.push(category);
          return 'gemini-2.5-flash';
        },
      },
    ];
    getPreferredFallbackModel(catalogs);
    expect(seen).toEqual(['balanced']);
  });
});

describe('gemini preference heuristic (providers/gemini.py parity)', () => {
  const capabilities = {
    'gemini-2.5-pro': { supportsExtendedThinking: true },
    'gemini-2.5-flash': { supportsExtendedThinking: false },
    'gemini-2.0-flash': { supportsExtendedThinking: true },
  };

  it('extended_reasoning prefers pro models with thinking support', () => {
    expect(
      geminiPreferModel(
        'extended_reasoning',
        ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
        capabilities,
      ),
    ).toBe('gemini-2.5-pro');
  });

  it('extended_reasoning falls back to any thinking model when no pro', () => {
    expect(
      geminiPreferModel(
        'extended_reasoning',
        ['gemini-2.5-flash', 'gemini-2.0-flash'],
        capabilities,
      ),
    ).toBe('gemini-2.0-flash');
  });

  it('fast_response prefers flash models', () => {
    expect(
      geminiPreferModel(
        'fast_response',
        ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
        capabilities,
      ),
    ).toBe('gemini-2.5-flash');
  });

  it('balanced prefers flash, then pro, then best available', () => {
    expect(
      geminiPreferModel('balanced', ['gemini-2.5-pro', 'gemini-2.5-flash'], capabilities),
    ).toBe('gemini-2.5-flash');
    expect(geminiPreferModel('balanced', ['gemini-2.5-pro'], capabilities)).toBe('gemini-2.5-pro');
    expect(geminiPreferModel('balanced', ['other-model'], capabilities)).toBe('other-model');
  });

  it('returns undefined for an empty allowed list', () => {
    expect(geminiPreferModel('balanced', [], capabilities)).toBeUndefined();
  });
});

describe('ordered preference list (providers/openai.py find_first parity)', () => {
  it('returns the first preference present in the allowed list', () => {
    expect(
      preferFromOrderedList(['gpt-5.1-codex', 'gpt-5.2', 'o3'], ['o3', 'gpt-5.2']),
    ).toBe('gpt-5.2');
  });

  it('falls back to the first allowed model when nothing matches', () => {
    expect(preferFromOrderedList(['gpt-5.1-codex'], ['o4-mini', 'o3-mini'])).toBe('o4-mini');
  });

  it('returns undefined for an empty allowed list', () => {
    expect(preferFromOrderedList(['gpt-5.2'], [])).toBeUndefined();
  });
});

describe('planner pacing (tools/planner.py parity)', () => {
  // Table: [totalSteps, stepNumber, expectedStatus]
  const pacingTable: Array<[number, number, string]> = [
    [5, 1, 'pause_for_deep_thinking'],
    [5, 2, 'pause_for_deep_thinking'],
    [5, 3, 'pause_for_deep_thinking'],
    [5, 4, 'pause_for_planning'],
    [8, 3, 'pause_for_deep_thinking'],
    [4, 1, 'pause_for_planning'],
    [4, 2, 'pause_for_planning'],
    [3, 3, 'pause_for_planning'],
  ];

  it.each(pacingTable)(
    'totalSteps=%i stepNumber=%i → %s',
    (totalSteps, stepNumber, expectedStatus) => {
      const decision = evaluatePlannerStep({
        step: 'Plan the rollout',
        stepNumber,
        totalSteps,
        nextStepRequired: true,
      });
      expect(decision.status).toBe(expectedStatus);
      expect(decision.thinkingRequired).toBe(expectedStatus === 'pause_for_deep_thinking');
    },
  );

  it('needsDeepThinkingPause matches totalSteps >= 5 && stepNumber <= 3', () => {
    expect(needsDeepThinkingPause(3, 5)).toBe(true);
    expect(needsDeepThinkingPause(4, 5)).toBe(false);
    expect(needsDeepThinkingPause(1, 4)).toBe(false);
  });

  it('completes when next_step_required is false, with plan summary', () => {
    const decision = evaluatePlannerStep({
      step: 'Final step content',
      stepNumber: 5,
      totalSteps: 5,
      nextStepRequired: false,
    });
    expect(decision.status).toBe('planning_complete');
    expect(decision.planningComplete).toBe(true);
    expect(decision.planSummary).toBe('COMPLETE PLAN: Final step content (Total 5 steps completed)');
  });

  it('reports remaining steps for simple continuation', () => {
    const decision = evaluatePlannerStep({
      step: 'Mid step',
      stepNumber: 4,
      totalSteps: 6,
      nextStepRequired: true,
    });
    expect(decision.remainingSteps).toBe(2);
    expect(decision.nextSteps).toBe('Continue with step 5. Approximately 2 steps remaining.');
  });

  it('required actions match the py phase checklists', () => {
    expect(getRequiredPlanningActions(1, 5)[0]).toMatch(/complete scope and complexity/);
    expect(getRequiredPlanningActions(2, 5)[0]).toMatch(/Evaluate the approach from step 1/);
    expect(getRequiredPlanningActions(3, 5)[0]).toMatch(/emerging plan addresses the original/);
    // Simple plans skip the deep-thinking checklists even at steps 2-3
    expect(getRequiredPlanningActions(2, 4)[0]).toMatch(/concrete, actionable steps/);
    expect(getRequiredPlanningActions(6, 8)[0]).toMatch(/concrete, actionable steps/);
  });

  it('registers a branch only when point, origin, and id are all present', () => {
    const none = registerPlannerBranch([], { isBranchPoint: true, branchFromStep: 2 });
    expect(none).toEqual([]);

    const added = registerPlannerBranch([], {
      isBranchPoint: true,
      branchFromStep: 2,
      branchId: 'alt-a',
    });
    expect(added).toEqual(['alt-a']);

    const deduped = registerPlannerBranch(added, {
      isBranchPoint: true,
      branchFromStep: 3,
      branchId: 'alt-a',
    });
    expect(deduped).toEqual(['alt-a']);
  });

  it('does not mutate the input branches list', () => {
    const branches = ['existing'];
    registerPlannerBranch(branches, {
      isBranchPoint: true,
      branchFromStep: 1,
      branchId: 'new-branch',
    });
    expect(branches).toEqual(['existing']);
  });
});

describe('confidence ladder + expert escalation (workflow_mixin.py / debug.py parity)', () => {
  it('the ladder is exploring → certain', () => {
    expect(CONFIDENCE_LEVELS).toEqual([
      'exploring',
      'low',
      'medium',
      'high',
      'very_high',
      'almost_certain',
      'certain',
    ]);
    expect(isConfidenceAtLeast('almost_certain', 'high')).toBe(true);
    expect(isConfidenceAtLeast('low', 'medium')).toBe(false);
  });

  it('skips expert analysis only at certain confidence on the final step', () => {
    expect(shouldSkipExpertAnalysis({ confidence: 'certain', nextStepRequired: false })).toBe(true);
    expect(shouldSkipExpertAnalysis({ confidence: 'certain', nextStepRequired: true })).toBe(false);
    expect(
      shouldSkipExpertAnalysis({ confidence: 'almost_certain', nextStepRequired: false }),
    ).toBe(false);
  });

  // Table: confidence, nextStepRequired, requiresExpert, shouldCall → decision
  const completionTable: Array<[ConfidenceLevel, boolean, boolean, boolean, CompletionDecision]> = [
    ['certain', false, true, true, 'high_confidence_completion'],
    ['almost_certain', false, true, true, 'calling_expert_analysis'],
    ['high', false, true, false, 'local_completion'],
    ['high', false, false, true, 'local_completion'],
    ['certain', true, true, true, 'calling_expert_analysis'],
  ];

  it.each(completionTable)(
    'confidence=%s nextStepRequired=%s requiresExpert=%s shouldCall=%s → %s',
    (confidence, nextStepRequired, requiresExpertAnalysis, shouldCallExpertAnalysis, expected) => {
      expect(
        decideCompletion({
          confidence,
          nextStepRequired,
          requiresExpertAnalysis,
          shouldCallExpertAnalysis,
        }),
      ).toBe(expected);
    },
  );

  it('recognizes the special escalation statuses', () => {
    expect(isSpecialStatus('files_required_to_continue')).toBe(true);
    expect(isSpecialStatus('code_too_large')).toBe(true);
    expect(isSpecialStatus('resend_prompt')).toBe(true);
    expect(isSpecialStatus('success')).toBe(false);
  });
});

describe('consensus rules (tools/consensus.py parity)', () => {
  it('step 1 requires the models list', () => {
    const result = validateConsensusStep(1, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Step 1 requires 'models' field/);
    }
  });

  it('rejects duplicate (model, stance) combinations, defaulting stance to neutral', () => {
    const result = validateConsensusStep(1, [
      { model: 'gpt5' },
      { model: 'gpt5', stance: 'neutral' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Duplicate model \+ stance combination found: gpt5/);
    }
  });

  it('accepts the same model with different stances', () => {
    const result = validateConsensusStep(1, [
      { model: 'gpt5', stance: 'for' },
      { model: 'gpt5', stance: 'against' },
      { model: 'pro', stance: 'neutral' },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.combinations).toEqual(['gpt5:for', 'gpt5:against', 'pro:neutral']);
    }
  });

  it('does not enforce models on later steps', () => {
    expect(validateConsensusStep(2, undefined).ok).toBe(true);
  });

  it('consults models sequentially, one per step, after the agent analysis step', () => {
    const models = [{ model: 'gpt5' as const }, { model: 'pro' as const }];
    expect(consensusModelForStep(1, models)).toBeUndefined();
    expect(consensusModelForStep(2, models)?.model).toBe('gpt5');
    expect(consensusModelForStep(3, models)?.model).toBe('pro');
    expect(consensusModelForStep(4, models)).toBeUndefined();
  });

  it('caps instances per combination at 2 (config.py:74)', () => {
    expect(DEFAULT_CONSENSUS_MAX_INSTANCES_PER_COMBINATION).toBe(2);
  });
});
