/**
 * pal-brain/pal-brain.service — the concrete {@link PalBrainService}: the PAL
 * agent-comms-brain the engines domain owns, composed over TWO engines-internal
 * seams (see the port header for the full contract):
 *
 *   - PURE owned-TS verbs (`plan`/`routeModel`/`planLaunch`/`escalate`) compose
 *     `@recoder/pal`'s deterministic in-proc decision layer. They NEVER throw and
 *     fall back to a conservative, deny-biased default on any internal fault.
 *   - SIDECAR verbs (`consensus`/`debate`/`health`) compose the frozen
 *     `EngineClientPort` transport (`PalMcpAdapter`) via `engine.invoke({
 *     op:'agentcomms' })`, bounding the multi-model call by a caller deadline and
 *     narrowing the raw reply with the deny-biased `VERDICT: BLOCK` parse.
 *
 * The route-brain internals (`categoryForIntent`/`preferModelFor`/
 * `buildProviderCatalogs`/`EXTENDED_REASONING_INTENTS`) and the deny-biased
 * consensus parse are pal decision logic — they live HERE, behind the facet, not
 * in the inference/governance consumer domains.
 *
 * DEGRADE LAW (per verb): a null/down/faulted sidecar degrades truthfully to
 * `abstain` + `degraded:true` + `engine:'synthetic'`; a pure-verb fault returns
 * the conservative default. NOTHING throws across the facet; nothing is fabricated
 * (never an off-catalog model, never a faked verdict).
 */
import {
  classifyTaskIntent,
  computePalPlanDecision,
  decideCompletion,
  getPreferredFallbackModel,
  shouldSkipExpertAnalysis,
  type ConfidenceLevel,
  type ProviderCatalog,
  type ProviderType,
  type RiskLevel,
  type ToolModelCategory,
} from '@recoder/pal';
import type { TaskIntent } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { EngineClientPort } from '../ports/engine-client.port.js';
import type { InvokeResult } from '../types.js';
import { PAL_AGENTCOMMS_OP } from '../adapters/sidecar/pal-comms.binder.js';
import type {
  PalBrainHealth,
  PalBrainService,
  PalCatalogModel,
  PalConsensusRequest,
  PalConsensusResult,
  PalEscalateDecision,
  PalEscalateInput,
  PalLaunchPlan,
  PalPlanDecision,
  PalPlanSpec,
  PalRouteDecision,
  PalRoutingHint,
} from '../ports/pal-brain.port.js';

export interface PalBrainServiceDeps {
  /** The pal-mcp raw transport (engines `PalMcpAdapter`); null ⇒ sidecar verbs abstain. */
  readonly engine: EngineClientPort | null;
  readonly logger: Logger;
}

const NOT_WIRED = 'pal-mcp engine client not wired';
/** Default wall-clock bound so a slow multi-model call never hangs the caller. */
const DEFAULT_CONSENSUS_TIMEOUT_MS = 20_000;

// --- routeModel internals (relocated pal decision logic — see file header) ------

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

const FAST_MODEL_HINT = /mini|flash|haiku|nano|small|lite|8b|3b|1b/i;
const REASONING_MODEL_HINT = /opus|sonnet|-pro|o1|o3|o4|reason|think|405b|70b|72b|large|deepseek-r/i;

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
  // anthropic, mistral, deepseek, groq, … route through the catch-all bucket.
  return 'custom';
}

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
  // Deterministic: lexicographically-last (newer families sort higher).
  return [...matches].sort().reverse()[0];
}

/** Group catalog models into pal `ProviderCatalog`s keyed by provider type. */
function buildProviderCatalogs(models: readonly PalCatalogModel[]): ProviderCatalog[] {
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

/**
 * Coerce a loose plan/route spec into the shape `computePalPlanDecision` and the
 * pal selectors normalize. A full `taskSpec` wins; otherwise a minimal spec is
 * built from the loose fields (a synthetic `taskId` avoids a spurious degrade to
 * the conservative default purely for a missing identity).
 */
function toTaskSpecInput(spec: PalPlanSpec | PalRoutingHint): Record<string, unknown> {
  if (spec.taskSpec && typeof spec.taskSpec === 'object') {
    return spec.taskSpec as Record<string, unknown>;
  }
  return {
    taskId: spec.taskId ?? `pal-brain-${Date.now()}`,
    intent: spec.intent ?? 'custom',
    title: spec.title ?? '',
    goal: spec.goal ?? '',
  };
}

/** Map a 0..1 confidence score onto pal's confidence ladder. */
function toConfidenceLevel(confidence: number | undefined): ConfidenceLevel {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) return 'medium';
  if (confidence >= 0.95) return 'certain';
  if (confidence >= 0.85) return 'almost_certain';
  if (confidence >= 0.75) return 'very_high';
  if (confidence >= 0.6) return 'high';
  if (confidence >= 0.4) return 'medium';
  if (confidence >= 0.2) return 'low';
  return 'exploring';
}

// --- consensus/debate parse (relocated from governance/pal-consensus.adapter) ---

/** A truthful "no opinion" result: the caller keeps its own verdict. */
function abstain(reason: string): PalConsensusResult {
  return { recommendation: 'abstain', reason, models: [], degraded: true, engine: 'synthetic' };
}

/** Best-effort JSON stringify of an opaque pal payload for token scanning. */
function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

/** Best-effort extraction of consulted model names from an opaque pal payload. */
function extractModels(value: unknown): readonly string[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const responses = record.responses ?? record.models ?? record.results;
  if (!Array.isArray(responses)) return [];
  const names: string[] = [];
  for (const entry of responses) {
    if (entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).model === 'string') {
      names.push((entry as Record<string, unknown>).model as string);
    } else if (typeof entry === 'string') {
      names.push(entry);
    }
  }
  return names;
}

/**
 * Parse the pal consensus/debate payload into a recommendation. Deny-biased: ANY
 * `VERDICT: BLOCK` from a consulted model ⇒ `block`. No models available or an
 * unparseable answer ⇒ `abstain` (never a fabricated objection). All-allow ⇒
 * `allow`.
 */
function parseConsensus(value: unknown): PalConsensusResult {
  const text = stringify(value).toUpperCase();
  const models = extractModels(value);

  if (!text || text.includes('NO_MODELS_AVAILABLE') || text.includes('"STATUS":"NO_MODELS_AVAILABLE"')) {
    return abstain('no models available for consensus');
  }

  const blocked = /VERDICT\s*:\s*BLOCK|RECOMMENDATION\s*:\s*BLOCK/.test(text);
  const allowed = /VERDICT\s*:\s*ALLOW|RECOMMENDATION\s*:\s*ALLOW/.test(text);

  if (blocked) {
    return {
      recommendation: 'block',
      reason: 'adversarial multi-model consensus flagged this high-risk write for human approval',
      models,
      degraded: false,
      engine: 'pal-mcp',
    };
  }
  if (allowed) {
    return {
      recommendation: 'allow',
      reason: 'adversarial multi-model consensus cleared this high-risk write',
      models,
      degraded: false,
      engine: 'pal-mcp',
    };
  }
  // A live answer we could not classify — do NOT invent an objection.
  return {
    recommendation: 'abstain',
    reason: 'consensus answer was inconclusive — keeping the caller verdict',
    models,
    degraded: true,
    engine: 'pal-mcp',
  };
}

/** A per-call timeout sentinel raced against the sidecar invoke. */
const TIMED_OUT = Symbol('pal-consensus-timeout');

/** Build the facet over the injected pal-mcp transport. */
export function createPalBrainService(deps: PalBrainServiceDeps): PalBrainService {
  const { engine, logger } = deps;

  /** Route one `agentcomms` operation through the transport, bounded + degrade-safe. */
  async function agentComms(
    operation: 'consensus' | 'debate',
    req: PalConsensusRequest,
  ): Promise<PalConsensusResult> {
    if (!engine) return abstain(NOT_WIRED);
    const timeoutMs = req.timeoutMs ?? DEFAULT_CONSENSUS_TIMEOUT_MS;
    const input: Record<string, unknown> = { operation, prompt: req.prompt };
    if (req.systemPrompt && req.systemPrompt.trim()) input.system_prompt = req.systemPrompt;
    if (req.models && req.models.length > 0) {
      input.models = req.models.map((model) => ({ model }));
    }
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
      });
      const call = engine.invoke({ op: PAL_AGENTCOMMS_OP, input, timeoutMs });
      const result = await Promise.race([call, timeout]);
      if (timer) clearTimeout(timer);
      if (result === TIMED_OUT) {
        logger.warn({ operation, timeoutMs }, 'pal consensus timed out — abstaining (caller verdict stands)');
        return abstain(`pal consensus timed out after ${timeoutMs}ms`);
      }
      const invoke = result as InvokeResult<unknown>;
      if (!invoke.ok) {
        logger.warn({ operation, reason: invoke.reason }, 'pal consensus call failed — abstaining');
        return abstain(`pal consensus unavailable: ${invoke.reason}`);
      }
      return parseConsensus(invoke.value);
    } catch (err) {
      logger.warn(
        { operation, err: err instanceof Error ? err.message : String(err) },
        'pal consensus threw — abstaining (caller verdict stands)',
      );
      return abstain('pal consensus faulted');
    }
  }

  return {
    async health(): Promise<PalBrainHealth> {
      if (!engine) return { available: false, pureVerbsAvailable: true, reason: NOT_WIRED };
      try {
        const h = await engine.health();
        if (h.status === 'up') {
          return { available: true, pureVerbsAvailable: true, ...(h.version ? { version: h.version } : {}) };
        }
        return {
          available: false,
          pureVerbsAvailable: true,
          reason: h.reason ?? `pal-mcp engine ${h.status}`,
        };
      } catch (err) {
        return {
          available: false,
          pureVerbsAvailable: true,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    },

    plan(spec: PalPlanSpec): PalPlanDecision {
      try {
        const result = computePalPlanDecision(toTaskSpecInput(spec));
        return {
          risk: result.decision.risk,
          approvalRequired: result.decision.approvalRequired,
          reason: result.reason ?? `pal ${result.status} (risk ${result.decision.risk})`,
        };
      } catch (err) {
        logger.debug(
          { err: err instanceof Error ? err.message : String(err) },
          'pal plan errored — conservative deny-biased default',
        );
        return { risk: 'high', approvalRequired: true, reason: 'pal plan faulted — conservative default' };
      }
    },

    routeModel(hint: PalRoutingHint, catalog: readonly PalCatalogModel[]): PalRouteDecision {
      try {
        const intent = classifyTaskIntent({
          intent: (hint.intent as TaskIntent) ?? 'custom',
          title: hint.title ?? '',
          goal: hint.goal ?? '',
        });
        const planResult = computePalPlanDecision(toTaskSpecInput(hint));
        const risk = planResult.decision.risk;
        const category = categoryForIntent(intent, risk);
        const preferDirect = risk === 'high';

        // No catalog to pick from ⇒ the caller keeps its model (never fabricate).
        if (catalog.length === 0) {
          return {
            model: '',
            preferDirect,
            intent,
            category,
            risk,
            source: 'default',
            reason: `pal(${intent}/${risk}) but catalog empty — caller keeps its model`,
          };
        }

        const catalogs = buildProviderCatalogs(catalog);
        const picked = getPreferredFallbackModel(catalogs, category);
        const routable = catalog.some((m) => m.modelId === picked);
        if (!routable) {
          return {
            model: '',
            preferDirect,
            intent,
            category,
            risk,
            source: 'default',
            reason: `pal(${intent}/${risk}→${category}) picked off-catalog '${picked}' — caller keeps its model`,
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
        logger.debug(
          { err: err instanceof Error ? err.message : String(err) },
          'pal routeModel errored — degrading to caller model',
        );
        return {
          model: '',
          preferDirect: false,
          intent: 'custom',
          category: 'balanced',
          risk: 'low',
          source: 'default',
          reason: 'pal route planner errored — caller keeps its model',
        };
      }
    },

    planLaunch(spec: PalPlanSpec): PalLaunchPlan {
      try {
        const result = computePalPlanDecision(toTaskSpecInput(spec));
        if (result.status === 'planned' && result.plan) {
          const { decision, plan } = result;
          return {
            risk: decision.risk,
            approvalRequired: decision.approvalRequired,
            runtimeId: decision.runtimeId,
            sandboxTier: decision.substrate,
            skills: plan.skills,
            toolGrants: decision.toolGrants,
            source: 'pal',
            reason: `pal planned launch (${decision.runtimeId}/${decision.substrate}, risk ${decision.risk})`,
          };
        }
        // degraded_default: conservative risk/approval, NO runtime/sandbox override.
        return {
          risk: result.decision.risk,
          approvalRequired: result.decision.approvalRequired,
          skills: [],
          toolGrants: [],
          source: 'default',
          reason: result.reason ?? 'pal degraded to conservative default — caller keeps its launch defaults',
        };
      } catch (err) {
        logger.debug(
          { err: err instanceof Error ? err.message : String(err) },
          'pal planLaunch errored — conservative deny-biased default',
        );
        return {
          risk: 'high',
          approvalRequired: true,
          skills: [],
          toolGrants: [],
          source: 'default',
          reason: 'pal planLaunch faulted — caller keeps its launch defaults',
        };
      }
    },

    escalate(input: PalEscalateInput): PalEscalateDecision {
      try {
        const confidence = toConfidenceLevel(input.confidence);
        // A high/medium-risk task requires expert analysis before completion.
        const requiresExpertAnalysis = input.risk === 'high' || input.risk === 'medium';
        const skip = shouldSkipExpertAnalysis({ confidence, nextStepRequired: false });
        const decision = decideCompletion({
          confidence,
          nextStepRequired: false,
          requiresExpertAnalysis,
          shouldCallExpertAnalysis: true,
        });
        return {
          escalate: decision === 'calling_expert_analysis',
          skipExpertAnalysis: skip,
          reason: `pal escalation: ${decision} (confidence ${confidence})`,
        };
      } catch (err) {
        logger.debug(
          { err: err instanceof Error ? err.message : String(err) },
          'pal escalate errored — no escalation (do nothing)',
        );
        return { escalate: false, skipExpertAnalysis: false, reason: 'pal escalate faulted — no escalation' };
      }
    },

    consensus(req: PalConsensusRequest): Promise<PalConsensusResult> {
      return agentComms('consensus', req);
    },

    debate(req: PalConsensusRequest): Promise<PalConsensusResult> {
      return agentComms('debate', req);
    },
  };
}
