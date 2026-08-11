/**
 * Per-agent attention manifest engine — a declarative, priority-arbitrated rule
 * engine that classifies a captured terminal tail into a truthful
 * {@link AttentionState}.
 *
 * ATTRIBUTION (Apache-2.0): this engine hosts a rule corpus PORTED from herdr's
 * terminal detection manifests (github.com/herdrdev/herdr,
 * `src/detect/manifests/*.toml`, licensed Apache-2.0). The engine primitives
 * here (regions, matchers, the priority evaluator) plus the per-agent rulesets
 * in {@link ./attention-manifests-agents.ts} re-express herdr's rules 1:1 in
 * Recoder's own {@link AttentionState} vocabulary — herdr's type names are NOT
 * used, and herdr's pane/agent-id/`idle`-fallback semantics are deliberately
 * dropped in favour of Recoder's truthfulness invariant (a tail that matches NO
 * rule yields no signal, never a fabricated "idle").
 *
 *   Copyright (c) Recoder.
 *   Detection rule corpus ported from herdr, Copyright (c) herdr contributors,
 *   licensed under the Apache License, Version 2.0. You may obtain a copy of the
 *   License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * A rule = { id, state, priority, region, matcher }. `region` slices the tail
 * (bottomLines/topLines/wholeRecent/afterLastHorizontalRule/promptBoxBody/
 * oscTitle); `matcher` is contains/regex/lineRegex composed with recursive
 * all/any/not gates. The highest-priority matching rule wins (first wins on a
 * tie). A rule may carry `skipStateUpdate` to mark a transcript/menu screen that
 * must produce NO signal. The engine PRIMITIVES (regions, matchers, RuleSpec)
 * live in {@link ./attention-manifests-core.ts} and the per-agent rulesets in
 * {@link ./attention-manifests-agents.ts}; both are re-exported here so the
 * engine module keeps its original public surface.
 */
import type { AttentionState } from '../types.js';
import {
  type RuleSpec,
  type TailContext,
  any,
  bottomLines,
  lineRegex,
  lineRegexAtLeast,
  recentWindow,
  regex,
  wholeRecent,
} from './attention-manifests-core.js';
import { AGENT_RULES } from './attention-manifests-agents.js';

// Re-export the engine primitives so `attention-manifests.js` remains the single
// public entrypoint (regions, matchers, RuleSpec, MAX_RECENT_LINES, TailContext).
export {
  type Matcher,
  type Region,
  type RuleSpec,
  type TailContext,
  MAX_RECENT_LINES,
  afterLastHorizontalRule,
  all,
  any,
  bottomLines,
  contains,
  lineRegex,
  lineRegexAtLeast,
  not,
  oscTitle,
  promptBoxBody,
  recentWindow,
  regex,
  topLines,
  wholeRecent,
} from './attention-manifests-core.js';

// --- shared heuristic vocabulary (agent-agnostic) ---------------------------

const PROGRESS_WORDS =
  'working|thinking|planning|analyzing|building|testing|running|searching|reviewing|loading|processing|writing|reading|editing|generating|reasoning|compiling|indexing|executing|refactoring|fixing|checking|scanning';

const SPINNER_PREFIX = '[⠁-⣿◐◓◑◒◴◷◶◵●○◦•·⋯⋮✦✧✶✻✽⏳⌛]';

const WORKING_ESC = /\besc\s+to\s+(?:interrupt|cancel|stop|abort)\b/i;
const WORKING_SPINNER = new RegExp(
  `^${SPINNER_PREFIX}\\s*(?:${PROGRESS_WORDS})(?:\\b|\\.\\.\\.|…|\\s)`,
  'i'
);
const WORKING_SUFFIX = new RegExp(
  `\\b(?:${PROGRESS_WORDS})\\b.*(?:\\.\\.\\.|…|\\d{1,3}%|/\\d+)`,
  'i'
);

const MENU_OPTION = /^\s*(?:❯\s*)?\d+[.)]\s+\S/;

const PROMPT_LINE_NONEMPTY = /^\s*(?:│\s*)?[>$❯›]\s*\S/;
const PROMPT_LINE_EMPTY = /^\s*(?:│\s*)?[>$❯›]\s*$/;

/**
 * The agent-agnostic ruleset — a declarative re-expression of the legacy inline
 * tail heuristics. Always evaluated, so a runtime-less classification keeps the
 * same behaviour it had before the manifest engine.
 */
export const GENERIC_RULES: readonly RuleSpec[] = [
  {
    id: 'generic_approval_prompt',
    state: 'awaiting_approval',
    priority: 900,
    region: wholeRecent,
    matcher: any(
      regex(/\bdo you want\b/i),
      regex(/\ballow\b[^\n?]*\?/i),
      regex(/\bpermission\b/i),
      regex(/\bapprove\b[^\n?]*\?/i),
      regex(/\(y\/n\)/i),
      regex(/\by\/n\b/i),
      lineRegex(/^\s*❯?\s*1[.)]\s*yes\b/i)
    ),
  },
  {
    id: 'generic_working',
    state: 'working',
    priority: 500,
    region: wholeRecent,
    matcher: any(
      regex(WORKING_ESC),
      lineRegex(WORKING_SPINNER),
      lineRegex(WORKING_SUFFIX)
    ),
  },
  {
    id: 'generic_settled_prompt',
    state: 'agent_idle_prompt',
    priority: 300,
    region: bottomLines(1),
    matcher: any(lineRegex(PROMPT_LINE_NONEMPTY), lineRegex(PROMPT_LINE_EMPTY)),
  },
  {
    id: 'generic_needs_input',
    state: 'agent_idle_prompt',
    priority: 260,
    region: wholeRecent,
    matcher: any(
      regex(/\bwaiting for (?:your )?(?:input|response|reply|answer)\b/i),
      regex(/\bpress\s+enter\b/i),
      regex(/\benter your\b/i),
      regex(/\btype your (?:message|response|answer|reply)\b/i)
    ),
  },
  {
    id: 'generic_selection_menu',
    state: 'agent_idle_prompt',
    priority: 250,
    region: wholeRecent,
    matcher: lineRegexAtLeast(MENU_OPTION, 2),
  },
];

// --- per-agent rulesets ------------------------------------------------------
// The full herdr-ported rulesets live in `attention-manifests-agents.ts` and are
// imported as AGENT_RULES (keeps this engine file focused). Re-exported here so
// the map remains reachable via the engine module's public surface.

export { AGENT_RULES };

/**
 * Runtime aliases → canonical id. Covers both the herdr manifest `aliases`
 * (hyphen forms) AND Recoder's own ConductorRuntimeId vocabulary (underscore
 * forms, packages/substrate/src/types/runtime-id.ts) so the per-agent rulesets
 * actually fire for a live workspace whose runtimeId is e.g. `claude_code`.
 */
const RUNTIME_ALIASES: Readonly<Record<string, string>> = {
  // claude
  'claude-code': 'claude',
  claude_code: 'claude',
  // cursor
  'cursor-agent': 'cursor',
  cursor_agent: 'cursor',
  // opencode
  'open-code': 'opencode',
  'herdr:opencode': 'opencode',
  // gemini
  gemini_cli: 'gemini',
  'gemini-cli': 'gemini',
  // grok
  'grok-build': 'grok',
  grok_build: 'grok',
  // pi
  'herdr:pi': 'pi',
};

function canonicalRuntime(runtime: string | null | undefined): string | null {
  if (runtime == null) return null;
  const key = runtime.trim().toLowerCase();
  if (key === '') return null;
  return RUNTIME_ALIASES[key] ?? key;
}

/** Agent-specific rules FIRST (so they win priority ties), then the generic set. */
function rulesForRuntime(
  runtime: string | null | undefined
): readonly RuleSpec[] {
  const key = canonicalRuntime(runtime);
  const agentRules = key != null ? (AGENT_RULES[key] ?? []) : [];
  return [...agentRules, ...GENERIC_RULES];
}

// --- evaluator --------------------------------------------------------------

/** The outcome of a manifest evaluation over a captured tail. */
export type ManifestOutcome =
  | {
      readonly kind: 'signal';
      readonly attention: AttentionState;
      readonly ruleId: string;
    }
  | { readonly kind: 'skip'; readonly ruleId: string }
  | { readonly kind: 'none' };

/** What a caller passes to {@link evaluateTailManifest}. */
export interface ManifestInput {
  /** The captured terminal tail. */
  readonly tail: string;
  /** The captured OSC title, when available. */
  readonly oscTitle?: string | null;
  /** The runtime that owns the terminal, when known (selects agent rules). */
  readonly runtime?: string | null;
}

/**
 * Evaluate the captured tail against the applicable rules. The highest-priority
 * matching rule wins (ties resolve to the earliest rule in evaluation order).
 * A `skip` rule yields `{ kind: 'skip' }`; NO match yields `{ kind: 'none' }`.
 *
 * TRUTHFULNESS INVARIANT: this NEVER falls back to an `'idle'`/guessed state —
 * an unmatched tail is a missing signal, surfaced by the caller as `'unknown'`.
 */
export function evaluateTailManifest(input: ManifestInput): ManifestOutcome {
  const ctx: TailContext = {
    tail: recentWindow(input.tail),
    oscTitle: input.oscTitle ?? '',
  };
  const rules = rulesForRuntime(input.runtime);

  let best: RuleSpec | null = null;
  for (const rule of rules) {
    if (!rule.matcher(rule.region(ctx))) continue;
    if (best == null || rule.priority > best.priority) best = rule;
  }

  if (best == null) return { kind: 'none' };
  if (best.skipStateUpdate === true) return { kind: 'skip', ruleId: best.id };
  return { kind: 'signal', attention: best.state, ruleId: best.id };
}
