/**
 * `PalBrainService` — the cohesive PAL agent-comms-brain facet the ENGINES domain
 * OWNS (docs/modules/communication.md: "the pal facets — plan · routeModel ·
 * consensus · escalate — ship in the `engines` domain"). It mirrors the openfang
 * `AgentEngineService` precedent: ONE typed interface over TWO engines-internal
 * seams, never re-implementing pal:
 *
 *   - PURE owned-TS verbs (`plan` · `routeModel` · `planLaunch` · `escalate`)
 *     compose `@recoder/pal`'s deterministic in-proc decision layer
 *     (`computePalPlanDecision` · `classifyTaskIntent` · `getPreferredFallbackModel`
 *     · the `selectSkills`/runtime/tool-grant/sandbox selectors · the
 *     expert-escalation ladder). No I/O — total + synchronous.
 *   - SIDECAR I/O verbs (`consensus` · `debate` · `health`) compose the frozen
 *     `EngineClientPort` transport into the `pal-mcp` Python server
 *     (`invoke({ op:'agentcomms' })`), where the heavy multi-model brain lives.
 *
 * The engines domain OWNS pal, so importing `@recoder/pal`'s `RiskLevel` /
 * `ToolModelCategory` string unions HERE is in-domain (not a leak). The INFERENCE,
 * CONDUCTOR, and GOVERNANCE consumer domains re-declare byte-identical local
 * unions so they take NO `@recoder/pal` import (see the consumer ports).
 *
 * DEGRADE LAW (per verb, truthful — never faked): the pure verbs NEVER throw and
 * fall back to a conservative, deny-biased default on any internal fault; the
 * sidecar verbs return `abstain` + `degraded:true` + `engine:'synthetic'` when the
 * pal-mcp server is absent / the call fails / times out / is unparseable — NEVER a
 * fabricated verdict.
 */
import type { RiskLevel, ToolModelCategory } from '@recoder/pal';
import type { TaskIntent } from '@recoder/agent-os';

/** Truthful facet liveness. Pure verbs are ALWAYS available (in-proc `@recoder/pal`);
 *  `available` gates only consensus/debate (the pal-mcp Python server). */
export interface PalBrainHealth {
  /** Sidecar up ⇒ consensus/debate live. */
  readonly available: boolean;
  /** plan/routeModel/planLaunch/escalate never go down (pure in-proc). */
  readonly pureVerbsAvailable: true;
  readonly reason?: string;
  readonly version?: string;
}

/** Loose task spec `computePalPlanDecision` normalizes (a full agent-os TaskSpec wins). */
export interface PalPlanSpec {
  readonly taskId?: string;
  readonly intent?: TaskIntent | string;
  readonly title?: string;
  readonly goal?: string;
  readonly taskSpec?: unknown;
}

/** The deny-biased governed plan decision (risk + approval gate). */
export interface PalPlanDecision {
  readonly risk: RiskLevel;
  readonly approvalRequired: boolean;
  readonly reason: string;
}

/** A generic catalog entry the routeModel picker chooses from (provider-agnostic). */
export interface PalCatalogModel {
  readonly provider: string;
  readonly modelId: string;
}

/** The routing hint the routeModel picker classifies + risk-scores. */
export interface PalRoutingHint {
  readonly intent?: TaskIntent | string;
  readonly title?: string;
  readonly goal?: string;
  readonly taskId?: string;
  readonly taskSpec?: unknown;
}

/** The route decision. `source:'default'` ⇒ pal declined; the caller keeps its
 *  model (the facet leaves `model` empty on decline). `category`/`risk` are the
 *  engines-domain `@recoder/pal` unions — the INFERENCE consumer re-declares its
 *  own byte-identical string unions so IT takes no pal import. */
export interface PalRouteDecision {
  readonly model: string;
  readonly preferDirect: boolean;
  readonly intent: TaskIntent;
  readonly category: ToolModelCategory;
  readonly risk: RiskLevel;
  readonly source: 'pal' | 'default';
  readonly reason: string;
}

/** The launch plan for the conductor: runtime/skill/tool-grant/sandbox + risk. */
export interface PalLaunchPlan {
  readonly risk: RiskLevel;
  readonly approvalRequired: boolean;
  /** selectRuntime — omitted on `default` so the caller keeps its runtime. */
  readonly runtimeId?: string;
  /** selectSandbox — omitted on `default` so the caller keeps its substrate. */
  readonly sandboxTier?: string;
  readonly skills: readonly string[];
  readonly toolGrants: readonly string[];
  readonly source: 'pal' | 'default';
  readonly reason: string;
}

/** Adversarial / stance multi-model call (governance framing lives in the caller). */
export interface PalConsensusRequest {
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly models?: readonly string[];
  readonly timeoutMs?: number;
}

/** Generic deny-biased result. `abstain` == "no opinion". NEVER fabricated. */
export interface PalConsensusResult {
  readonly recommendation: 'allow' | 'block' | 'abstain';
  readonly reason: string;
  readonly models: readonly string[];
  readonly degraded: boolean;
  /** `'pal-mcp'` on a live answer, `'synthetic'` on a degraded abstain. */
  readonly engine: string;
}

/** Input to the expert-escalation gate (confidence + optional intent/risk). */
export interface PalEscalateInput {
  readonly confidence?: number;
  readonly intent?: TaskIntent | string;
  readonly risk?: RiskLevel;
}
/** The escalation decision: escalate to a second model / skip expert analysis. */
export interface PalEscalateDecision {
  readonly escalate: boolean;
  readonly skipExpertAnalysis: boolean;
  readonly reason: string;
}

/**
 * The cohesive pal brain (see file header for the degrade law). Pure verbs are
 * synchronous + total; the I/O verbs are async + degrade-truthful.
 */
export interface PalBrainService {
  health(): Promise<PalBrainHealth>;

  // -- pure owned-TS decision verbs (never throw; conservative default on fault) --
  /** The governed plan decision (risk + approval gate) — `computePalPlanDecision`. */
  plan(spec: PalPlanSpec): PalPlanDecision;
  /** Pick provider/model by intent+risk over the catalog — never off-catalog. */
  routeModel(hint: PalRoutingHint, catalog: readonly PalCatalogModel[]): PalRouteDecision;
  /** The conductor launch plan (runtime/skills/tool-grants/sandbox + risk). */
  planLaunch(spec: PalPlanSpec): PalLaunchPlan;
  /** The expert-escalation / completion gate. */
  escalate(input: PalEscalateInput): PalEscalateDecision;

  // -- sidecar multi-model verbs (truthful abstain/decline when down) --
  /** `agentcomms` operation=consensus — deny-biased VERDICT parse. */
  consensus(req: PalConsensusRequest): Promise<PalConsensusResult>;
  /** `agentcomms` operation=debate — per-model stances over the same transport. */
  debate(req: PalConsensusRequest): Promise<PalConsensusResult>;
  // NOTE: NO route()/listModels() — those stay MCP-only on pal-comms.binder.
}
