/**
 * Conductor attention classifier — classifies a pane's captured text as
 * `needs-you` / `working` / `idle` using dmux's PURE pane-attention heuristics
 * (Wave G1 backend fusion of ts/dmux dist/utils/paneAttentionHeuristics.js).
 *
 * What is absorbed from dmux:
 *   - `hasAgentWorkingIndicators(content, agent?)` — the battle-tested "the agent
 *     is actively working" signal (spinners, progress words, "esc to interrupt").
 *   - `buildPaneActivityFingerprint(content)` — the stable fingerprint used by
 *     DmuxAttentionService for notification dedupe (callers can suppress repeat
 *     alerts for an unchanged pane, mirroring dmux's notifiedFingerprints design).
 *
 * What is REPLICATED locally (per the absorption audit): dmux's `waiting`
 * detection lives in its LLM-backed PaneAnalyzer (`option_dialog` state) + the
 * trivial `buildAttentionEvent` mapping inside StatusDetector — too heavy/coupled
 * to absorb. The needs-you patterns below are a conservative, dependency-free
 * replication of that option-dialog / permission-prompt signal.
 *
 * CRITICAL import constraints (verified):
 *   - NEVER import `@recoder/dmux` (dist/index.js) — top-level app-setup side
 *     effects. Only the side-effect-free submodule dist is loaded.
 *   - Package `exports` only exposes "." and "./package.json" → resolve the dist
 *     file via `require.resolve('@recoder/dmux/package.json')` + file-URL import.
 *   - dmux dist is ESM, backend compiles CJS → the dynamic import is kept
 *     native via an indirect `new Function` (tsc would transpile `import()` to
 *     `require()` otherwise).
 *
 * Degrade-safe: dmux unavailable → `classifyAttention` returns `undefined`
 * truthfully; this module NEVER throws and NEVER fakes a classification.
 */
import { createLogger } from '../../logger.js';

const logger = createLogger('conductor:dmux:attention');

/** Attention states, mirroring dmux's working/waiting/idle model. */
export type AttentionState = 'needs-you' | 'working' | 'idle';

/** Result of classifying a pane's captured text. */
export interface AttentionClassification {
  state: AttentionState;
  /**
   * Stable fingerprint of the pane's recent activity (dmux
   * `buildPaneActivityFingerprint`) — use it to dedupe repeat notifications for
   * an unchanged pane, mirroring DmuxAttentionService's notifiedFingerprints.
   */
  fingerprint: string;
  /** Human-auditable reason for the classification. */
  reason: string;
}

/** Minimal structural surface of dist/utils/paneAttentionHeuristics.js. */
export interface DmuxAttentionModule {
  hasAgentWorkingIndicators: (content: string, agent?: string) => boolean;
  buildPaneActivityFingerprint: (content: string, maxLines?: number) => string;
}

/** Injectable loader seam (tests mock this; production uses the lazy default). */
export type DmuxAttentionModuleLoader = () => Promise<DmuxAttentionModule | null>;

/** dmux's pure heuristics submodule, exposed as a clean subpath export (added to
 * ts/dmux/package.json for the Recoder fusion) — side-effect-free, unlike root ".". */
const DMUX_ATTENTION_SPECIFIER = '@recoder/dmux/utils/paneAttentionHeuristics';

/** Native dynamic import shielded from tsc's CJS `import()`→`require()` rewrite. */
const nativeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<Record<string, unknown>>;

/**
 * Import an ESM package subpath from CJS-compiled code, robust across BOTH runtimes:
 *   1. Plain CJS Node runtime: the indirect native `import(specifier)`.
 *   2. vitest/vite-node VM: the indirect Function throws, so fall back to a plain
 *      `import(specifier)` which the vite transform handles.
 */
async function importEsmSpecifier(specifier: string): Promise<Record<string, unknown>> {
  try {
    return await nativeImport(specifier);
  } catch {
    return (await import(specifier)) as Record<string, unknown>;
  }
}

/**
 * Default lazy loader for dmux's pane-attention heuristics submodule (via its
 * clean subpath export). Side-effect-free. Returns `null` (never throws) when the
 * package or submodule is unavailable or structurally wrong.
 */
export async function loadDmuxAttentionModule(): Promise<DmuxAttentionModule | null> {
  try {
    const mod = await importEsmSpecifier(DMUX_ATTENTION_SPECIFIER);
    const hasAgentWorkingIndicators = (mod as Partial<DmuxAttentionModule>).hasAgentWorkingIndicators;
    const buildPaneActivityFingerprint = (mod as Partial<DmuxAttentionModule>)
      .buildPaneActivityFingerprint;
    if (
      typeof hasAgentWorkingIndicators !== 'function' ||
      typeof buildPaneActivityFingerprint !== 'function'
    ) {
      return null;
    }
    return { hasAgentWorkingIndicators, buildPaneActivityFingerprint };
  } catch (err) {
    logger.debug(
      { err: err instanceof Error ? err.message : String(err) },
      'dmux attention heuristics unavailable — classification degrades to undefined',
    );
    return null;
  }
}

/**
 * Conservative needs-you signals, replicated from the design of dmux's
 * StatusDetector `buildAttentionEvent` + PaneAnalyzer `option_dialog` state:
 * explicit confirmation prompts and permission/approval waits.
 */
const NEEDS_YOU_PATTERNS: readonly RegExp[] = [
  /\((?:y\/n|yes\/no)\)/i,
  /\[(?:y\/n|yes\/no)\]/i,
  /\bdo you want\b/i,
  /\bwould you like\b/i,
  /\bproceed\?/i,
  /\bcontinue\?\s*$/im,
  /waiting for (?:your )?(?:input|approval|confirmation|response)/i,
  /\bpermission request\b/i,
  /\bneeds? your (?:attention|input|approval|review)\b/i,
  /\bpress (?:enter|any key) to\b/i,
];

/** A numbered option line, e.g. "❯ 1. Yes" / "2) Allow always" (option dialog). */
const OPTION_LINE_PATTERN = /^\s*(?:[❯>]\s*)?\d+[.)]\s+\S/;

/** How many trailing lines of the capture the needs-you scan considers. */
const RECENT_LINES_WINDOW = 12;

/** Extract the trailing non-empty lines the classification should look at. */
function recentLines(paneText: string): string[] {
  return paneText
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(-RECENT_LINES_WINDOW);
}

/** Detect an option dialog / confirmation prompt in the recent lines. */
function detectNeedsYou(lines: readonly string[]): string | null {
  const recentContent = lines.join('\n');
  for (const pattern of NEEDS_YOU_PATTERNS) {
    if (pattern.test(recentContent)) {
      return `confirmation prompt detected (${pattern.source})`;
    }
  }
  const optionLines = lines.filter((line) => OPTION_LINE_PATTERN.test(line));
  if (optionLines.length >= 2) {
    return `option dialog detected (${optionLines.length} numbered options)`;
  }
  return null;
}

export interface ClassifyAttentionOptions {
  /** Agent hint forwarded to dmux's working-indicator heuristics (e.g. 'claude'). */
  agent?: string;
  /** Injectable loader seam — tests supply a fake; production omits it. */
  loadAttentionModule?: DmuxAttentionModuleLoader;
}

/**
 * Classify a pane's captured text. Precedence mirrors dmux's model: active
 * working indicators win (dmux only reports `waiting` once a pane has settled),
 * then option-dialog / confirmation prompts (`needs-you`), else `idle`.
 *
 * Returns `undefined` (truthfully, never throws) when the dmux heuristics are
 * unavailable — callers must treat that as "no signal", not as idle.
 */
export async function classifyAttention(
  paneText: string,
  opts: ClassifyAttentionOptions = {},
): Promise<AttentionClassification | undefined> {
  try {
    const loader = opts.loadAttentionModule ?? loadDmuxAttentionModule;
    const heuristics = await loader();
    if (
      !heuristics ||
      typeof heuristics.hasAgentWorkingIndicators !== 'function' ||
      typeof heuristics.buildPaneActivityFingerprint !== 'function'
    ) {
      return undefined;
    }

    const text = typeof paneText === 'string' ? paneText : '';
    const fingerprint = heuristics.buildPaneActivityFingerprint(text);
    if (text.trim().length === 0) {
      return { state: 'idle', fingerprint, reason: 'no recent pane activity' };
    }

    if (heuristics.hasAgentWorkingIndicators(text, opts.agent)) {
      return {
        state: 'working',
        fingerprint,
        reason: 'agent working indicators present (dmux heuristics)',
      };
    }

    const needsYouReason = detectNeedsYou(recentLines(text));
    if (needsYouReason) {
      return { state: 'needs-you', fingerprint, reason: needsYouReason };
    }

    return { state: 'idle', fingerprint, reason: 'no working or attention signals detected' };
  } catch (err) {
    // Degrade-safe: heuristics threw or the loader misbehaved — report "no
    // signal" truthfully rather than crash or guess.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      'attention classification failed — degrading to undefined',
    );
    return undefined;
  }
}
