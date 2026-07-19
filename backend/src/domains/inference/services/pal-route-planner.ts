/**
 * `pal-route-planner.ts` — the PAL routing BRAIN for the inference delivery
 * ladder. It fuses `@recoder/pal`'s pure TS decision layer into ROUTE SELECTION:
 * given a caller's task-intent `RoutingHint` + the enabled model catalog it picks
 * the provider/model (and the rung — `preferDirect`) by INTENT, instead of taking
 * the caller's `model` verbatim.
 *
 * The three real pal calls that make this a genuine fusion (not a stub):
 *   1. `classifyTaskIntent`      — intent from the spec (custom ⇒ inferred from text)
 *   2. `computePalPlanDecision`  — the governed plan decision (risk + approval gate)
 *   3. `getPreferredFallbackModel` — pal's provider-priority model picker over the
 *                                    catalog, category-aware via a `preferModel`.
 *
 * INTENT → model-category → model, and RISK → rung: a high-risk plan is escalated
 * to `extended_reasoning` and pinned to the direct BYOK rung (`preferDirect`) so
 * the exact chosen model is served first.
 *
 * DEGRADE-SAFE BY CONSTRUCTION: `plan()` NEVER throws and NEVER fabricates an
 * off-catalog model. When pal errors, the catalog is empty, or the picked model
 * is not routable, it returns the caller's requested model unchanged with
 * `source:'default'` — the ladder then behaves exactly as before the fusion.
 */
import {
  classifyTaskIntent,
  computePalPlanDecision,
  getPreferredFallbackModel,
  type ProviderCatalog,
  type ProviderType,
  type RiskLevel,
  type ToolModelCategory,
} from '@recoder/pal';
import type { TaskIntent } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { ModelCatalogEntry, RoutingHint } from '../types.js';

/** The routing decision the brain returns for one request. */
export interface RouteDecision {
  /** The model id the ladder should route (always a routable catalog id, or the request's). */
  readonly model: string;
  /** Route the direct BYOK rung FIRST (set for high-risk plans). */
  readonly preferDirect: boolean;
  /** The intent pal classified the task as. */
  readonly intent: TaskIntent;
  /** The model category the intent/risk mapped to. */
  readonly category: ToolModelCategory;
  /** pal's estimated risk level for the task. */
  readonly risk: RiskLevel;
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

/** Intents that warrant a deep-reasoning model even at baseline risk. */
const EXTENDED_REASONING_INTENTS: ReadonlySet<TaskIntent> = new Set<TaskIntent>([
  'bugfix',
  'refactor',
  'code_review',
  'incident_response',
  'migration',
  'platform_hardening',
  'research',
  'verification',
]);

/** Intents that favour a fast/cheap model. */
const FAST_RESPONSE_INTENTS: ReadonlySet<TaskIntent> = new Set<TaskIntent>([
  'documentation',
  'handoff',
]);

/** Map an intent (+ risk escalation) to a pal model category. */
function categoryForIntent(intent: TaskIntent, risk: RiskLevel): ToolModelCategory {
  if (risk === 'high') return 'extended_reasoning';
  if (EXTENDED_REASONING_INTENTS.has(intent)) return 'extended_reasoning';
  if (FAST_RESPONSE_INTENTS.has(intent)) return 'fast_response';
  return 'balanced';
}

/** Map a catalog provider string onto pal's `ProviderType` bucket. */
function providerTypeFor(provider: string): ProviderType {
  const p = provider.toLowerCase();
  if (p === 'google' || p === 'gemini' || p === 'vertex') return 'google';
  if (p === 'openai') return 'openai';
  if (p === 'azure') return 'azure';
  if (p === 'xai' || p === 'grok') return 'xai';
  if (p === 'dial') return 'dial';
  if (p === 'openrouter') return 'openrouter';
  // anthropic, mistral, deepseek, groq, … all route through the catch-all bucket
  // so their catalog models still participate in the pal picker.
  return 'custom';
}

const FAST_MODEL_HINT = /mini|flash|haiku|nano|small|lite|8b|3b|1b/i;
const REASONING_MODEL_HINT = /opus|sonnet|-pro|o1|o3|o4|reason|think|405b|70b|72b|large|deepseek-r/i;

/**
 * A category-aware `preferModel` closure over one provider's models. Returns the
 * best category match, else `undefined` (pal then keeps its first-available pick).
 */
function preferModelFor(category: ToolModelCategory, allowed: readonly string[]): string | undefined {
  if (allowed.length === 0) return undefined;
  const pattern =
    category === 'fast_response'
      ? FAST_MODEL_HINT
      : category === 'extended_reasoning'
        ? REASONING_MODEL_HINT
        : null;
  if (!pattern) return undefined; // balanced ⇒ no keyword preference
  const matches = allowed.filter((m) => pattern.test(m));
  if (matches.length === 0) return undefined;
  // Deterministic: lexicographically-last (newer families sort higher, e.g. 4o > 3.5).
  return [...matches].sort().reverse()[0];
}

/**
 * Group enabled catalog models into pal `ProviderCatalog`s keyed by provider
 * type. The requested `category` is NOT applied here — it is threaded through
 * `getPreferredFallbackModel`'s `toolCategory` arg, which forwards it to each
 * catalog's `preferModel`.
 */
function buildProviderCatalogs(models: readonly ModelCatalogEntry[]): ProviderCatalog[] {
  const byType = new Map<ProviderType, string[]>();
  for (const m of models) {
    const type = providerTypeFor(m.provider);
    const list = byType.get(type);
    if (list) list.push(m.modelId);
    else byType.set(type, [m.modelId]);
  }
  const catalogs: ProviderCatalog[] = [];
  for (const [provider, allowedModels] of byType) {
    catalogs.push({
      provider,
      allowedModels,
      preferModel: (cat, allowed) => preferModelFor(cat, allowed),
    });
  }
  return catalogs;
}

export interface PalRoutePlannerDeps {
  readonly logger: Logger;
}

/**
 * Build the pal routing brain. Stateless + pure; the service injects it and
 * consults it once per request when a `routingHint` is present.
 */
export function createPalRoutePlanner(deps: PalRoutePlannerDeps): PalRoutePlannerPort {
  const log = deps.logger;

  return {
    plan(hint, models, requestedModel): RouteDecision {
      try {
        const specInput = toTaskSpecInput(hint);
        const intent = classifyTaskIntent({
          intent: (hint.intent as TaskIntent) ?? 'custom',
          title: hint.title ?? '',
          goal: hint.goal ?? '',
        });
        const planResult = computePalPlanDecision(specInput);
        const risk = planResult.decision.risk;
        const category = categoryForIntent(intent, risk);
        const preferDirect = risk === 'high';

        // No catalog to pick from ⇒ keep the caller's model (never fabricate).
        if (models.length === 0) {
          return {
            model: requestedModel,
            preferDirect,
            intent,
            category,
            risk,
            source: 'default',
            reason: `pal(${intent}/${risk}) but catalog empty — kept requested model`,
          };
        }

        const catalogs = buildProviderCatalogs(models);
        const picked = getPreferredFallbackModel(catalogs, category);
        const routable = models.some((m) => m.modelId === picked);
        if (!routable) {
          return {
            model: requestedModel,
            preferDirect,
            intent,
            category,
            risk,
            source: 'default',
            reason: `pal(${intent}/${risk}→${category}) picked off-catalog '${picked}' — kept requested model`,
          };
        }

        return {
          model: picked,
          preferDirect,
          intent,
          category,
          risk,
          source: 'pal',
          reason: `pal routed ${intent}/${risk}→${category} to ${picked}${preferDirect ? ' (direct rung)' : ''}`,
        };
      } catch (err) {
        log.debug(
          { err: err instanceof Error ? err.message : String(err) },
          'pal route planner errored — degrading to requested model',
        );
        return {
          model: requestedModel,
          preferDirect: false,
          intent: 'custom',
          category: 'balanced',
          risk: 'low',
          source: 'default',
          reason: 'pal route planner errored — kept requested model',
        };
      }
    },
  };
}

/**
 * Coerce a `RoutingHint` into the loose task-spec shape `computePalPlanDecision`
 * normalizes. A full `hint.taskSpec` wins; otherwise a minimal spec is built from
 * the loose fields (a synthetic `taskId` is supplied so pal does not degrade to
 * its conservative default purely for a missing identity).
 */
function toTaskSpecInput(hint: RoutingHint): unknown {
  if (hint.taskSpec && typeof hint.taskSpec === 'object') return hint.taskSpec;
  return {
    taskId: hint.taskId ?? `inference-${Date.now()}`,
    intent: hint.intent ?? 'custom',
    title: hint.title ?? '',
    goal: hint.goal ?? '',
  };
}
