/**
 * Per-agent attention manifest engine — a declarative, priority-arbitrated rule
 * engine that classifies a captured terminal tail into a truthful
 * {@link AttentionState}.
 *
 * DESIGN LINEAGE (clean-room, Apache-2.0): the region/matcher/priority model is
 * derived from herdr's terminal detection manifests
 * (github.com/herdrdev/herdr, licensed Apache-2.0). This is a clean-room
 * re-expression in Recoder's own AttentionState vocabulary — NOT a copy: no
 * TOML is reproduced, and herdr's pane/agent-id/Idle-fallback semantics are
 * deliberately dropped in favour of Recoder's truthfulness invariant (a tail
 * that matches NO rule yields no signal, never a fabricated "idle").
 *
 *   Copyright (c) Recoder.
 *   Portions of the detection design are inspired by herdr, Copyright (c) herdr
 *   contributors, licensed under the Apache License, Version 2.0. You may obtain
 *   a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * A rule = { id, state, priority, region, matcher }. `region` slices the tail
 * (bottomLines/topLines/wholeRecent/afterLastHorizontalRule/promptBoxBody/
 * oscTitle); `matcher` is contains/regex/lineRegex composed with recursive
 * all/any/not gates. The highest-priority matching rule wins (first wins on a
 * tie). A rule may carry `skipStateUpdate` to mark a transcript/menu screen that
 * must produce NO signal.
 */
import type { AttentionState } from '../types.js';

// --- context ----------------------------------------------------------------

/** The captured surfaces a rule region can slice. */
export interface TailContext {
    /** The recent terminal tail (raw text, newest content at the bottom). */
    readonly tail: string;
    /** The OSC window title, when the substrate captured one (`''` if absent). */
    readonly oscTitle: string;
}

/** How many trailing tail lines the engine considers (bounds regex cost). */
export const MAX_RECENT_LINES = 120;

// --- regions ----------------------------------------------------------------

/** A region selects a slice of the captured context for a matcher to read. */
export type Region = (ctx: TailContext) => string;

function splitLines(text: string): readonly string[] {
    return text.split('\n').map((line) => line.replace(/\r$/, ''));
}

function nonEmptyIndices(lines: readonly string[]): readonly number[] {
    const indices: number[] = [];
    for (let i = 0; i < lines.length; i += 1) {
        if (lines[i]!.trim() !== '') indices.push(i);
    }
    return indices;
}

/** The whole recent tail window. */
export const wholeRecent: Region = (ctx) => ctx.tail;

/** The OSC window title (empty string when the substrate captured none). */
export const oscTitle: Region = (ctx) => ctx.oscTitle;

/** The last `n` NON-EMPTY lines through the end of the tail. */
export function bottomLines(n: number): Region {
    return (ctx) => {
        const lines = splitLines(ctx.tail);
        const indices = nonEmptyIndices(lines);
        if (indices.length === 0) return '';
        const start = indices[Math.max(0, indices.length - n)]!;
        return lines.slice(start).join('\n');
    };
}

/** The first `n` NON-EMPTY lines from the start of the tail. */
export function topLines(n: number): Region {
    return (ctx) => {
        const lines = splitLines(ctx.tail);
        const indices = nonEmptyIndices(lines);
        if (indices.length === 0) return '';
        const end = indices[Math.min(indices.length, n) - 1]!;
        return lines.slice(0, end + 1).join('\n');
    };
}

/** Everything AFTER the last horizontal-rule line (the whole tail if none). */
export const afterLastHorizontalRule: Region = (ctx) => {
    const lines = splitLines(ctx.tail);
    let lastRule = -1;
    for (let i = 0; i < lines.length; i += 1) {
        if (isHorizontalRule(lines[i]!)) lastRule = i;
    }
    if (lastRule < 0) return ctx.tail;
    return lines.slice(lastRule + 1).join('\n');
};

/** The body of the bottom-most prompt box (between its two border rules). */
export const promptBoxBody: Region = (ctx) => {
    const lines = splitLines(ctx.tail);
    const top = promptBoxTopBorderIndex(lines);
    if (top == null) return '';
    let end = lines.length;
    for (let i = top + 1; i < lines.length; i += 1) {
        if (isHorizontalRule(lines[i]!)) {
            end = i;
            break;
        }
    }
    return lines.slice(top + 1, end).join('\n');
};

function promptBoxTopBorderIndex(lines: readonly string[]): number | null {
    let count = 0;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (isHorizontalRule(lines[i]!)) {
            count += 1;
            if (count === 2) return i;
        }
    }
    return null;
}

function isHorizontalRule(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    const chars = [...trimmed];
    let ruleChars = 0;
    for (const ch of chars) {
        if (ch === '─') ruleChars += 1;
        else break;
    }
    if (ruleChars === 0) return false;
    const suffix = chars.slice(ruleChars).join('').replace(/^\s+/, '');
    return suffix === '' || ruleChars >= 3;
}

// --- matchers ---------------------------------------------------------------

/** A matcher is a pure predicate over a region's sliced text. */
export type Matcher = (text: string) => boolean;

/** True when the text contains ALL needles (case-insensitive). */
export function contains(...needles: readonly string[]): Matcher {
    const lowered = needles.map((needle) => needle.toLowerCase());
    return (text) => {
        const haystack = text.toLowerCase();
        return lowered.every((needle) => haystack.includes(needle));
    };
}

/** True when the pattern matches anywhere in the region text. */
export function regex(pattern: RegExp): Matcher {
    return (text) => pattern.test(text);
}

/** True when the pattern matches at least one line of the region text. */
export function lineRegex(pattern: RegExp): Matcher {
    return (text) => text.split('\n').some((line) => pattern.test(line));
}

/** True when the pattern matches AT LEAST `count` distinct lines. */
export function lineRegexAtLeast(pattern: RegExp, count: number): Matcher {
    return (text) => text.split('\n').filter((line) => pattern.test(line)).length >= count;
}

/** True when EVERY nested matcher matches. */
export function all(...matchers: readonly Matcher[]): Matcher {
    return (text) => matchers.every((matcher) => matcher(text));
}

/** True when AT LEAST ONE nested matcher matches. */
export function any(...matchers: readonly Matcher[]): Matcher {
    return (text) => matchers.some((matcher) => matcher(text));
}

/** True when the nested matcher does NOT match. */
export function not(matcher: Matcher): Matcher {
    return (text) => !matcher(text);
}

// --- rule spec --------------------------------------------------------------

/** A single declarative detection rule. */
export interface RuleSpec {
    /** Stable identifier surfaced in the classifier reason for auditing. */
    readonly id: string;
    /** The attention this rule asserts when it matches. */
    readonly state: AttentionState;
    /** Higher wins; ties resolve to the first rule in evaluation order. */
    readonly priority: number;
    /** The tail slice this rule reads. */
    readonly region: Region;
    /** The predicate over the sliced text. */
    readonly matcher: Matcher;
    /**
     * When true, a match marks a transcript/menu screen that carries NO
     * attention signal — the engine returns `skip`, and the classifier stays
     * truthfully `'unknown'` instead of guessing.
     */
    readonly skipStateUpdate?: boolean;
}

// --- shared heuristic vocabulary (agent-agnostic) ---------------------------

const PROGRESS_WORDS =
    'working|thinking|planning|analyzing|building|testing|running|searching|reviewing|loading|processing|writing|reading|editing|generating|reasoning|compiling|indexing|executing|refactoring|fixing|checking|scanning';

const SPINNER_PREFIX = '[⠁-⣿◐◓◑◒◴◷◶◵●○◦•·⋯⋮✦✧✶✻✽⏳⌛]';

const WORKING_ESC = /\besc\s+to\s+(?:interrupt|cancel|stop|abort)\b/i;
const WORKING_SPINNER = new RegExp(`^${SPINNER_PREFIX}\\s*(?:${PROGRESS_WORDS})(?:\\b|\\.\\.\\.|…|\\s)`, 'i');
const WORKING_SUFFIX = new RegExp(`\\b(?:${PROGRESS_WORDS})\\b.*(?:\\.\\.\\.|…|\\d{1,3}%|/\\d+)`, 'i');

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
            lineRegex(/^\s*❯?\s*1[.)]\s*yes\b/i),
        ),
    },
    {
        id: 'generic_working',
        state: 'working',
        priority: 500,
        region: wholeRecent,
        matcher: any(regex(WORKING_ESC), lineRegex(WORKING_SPINNER), lineRegex(WORKING_SUFFIX)),
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
            regex(/\btype your (?:message|response|answer|reply)\b/i),
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

// --- per-agent rulesets (derived from herdr manifests, Recoder vocabulary) ---

const CLAUDE_RULES: readonly RuleSpec[] = [
    {
        id: 'claude_transcript_viewer',
        state: 'unknown',
        priority: 1000,
        region: bottomLines(3),
        skipStateUpdate: true,
        matcher: all(
            contains('showing detailed transcript'),
            any(
                contains('ctrl+o', 'to toggle'),
                contains('ctrl+e', 'show all'),
                contains('↑↓ scroll'),
                contains('? for shortcuts'),
            ),
        ),
    },
    {
        id: 'claude_live_prompt_box',
        state: 'agent_idle_prompt',
        priority: 950,
        region: promptBoxBody,
        matcher: all(
            lineRegex(/^\s*❯/),
            not(any(contains('enter to select'), contains('esc to cancel'), contains('to navigate'))),
        ),
    },
    {
        id: 'claude_model_picker_menu',
        state: 'unknown',
        priority: 900,
        region: wholeRecent,
        skipStateUpdate: true,
        matcher: all(
            contains('select model', 'enter to set as default', 'esc to cancel'),
            not(any(contains('do you want to proceed?'), contains('enter to select'))),
        ),
    },
    {
        id: 'claude_bash_permission_prompt',
        state: 'awaiting_approval',
        priority: 850,
        region: wholeRecent,
        matcher: all(
            contains('do you want to proceed?'),
            any(
                contains('bash command'),
                contains('bash('),
                contains('contains expansion'),
                contains('tab to amend'),
                contains('ctrl+e to explain'),
            ),
        ),
    },
    {
        id: 'claude_generic_permission_prompt',
        state: 'awaiting_approval',
        priority: 840,
        region: afterLastHorizontalRule,
        matcher: all(
            contains('do you want to proceed?', 'esc to cancel'),
            any(lineRegex(/^\s*❯?\s*1[.)]\s*yes\b/i), lineRegex(/^\s*2[.)]\s*no\b/i)),
        ),
    },
];

const CODEX_RULES: readonly RuleSpec[] = [
    {
        id: 'codex_osc_title_working',
        state: 'working',
        priority: 1050,
        region: oscTitle,
        matcher: regex(/(?:^| )[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏](?: |$)/),
    },
    {
        id: 'codex_trust_directory',
        state: 'awaiting_approval',
        priority: 950,
        region: topLines(20),
        matcher: all(regex(/^> You are in /m), regex(/do\s+you\s+trust\s+the\s+contents\s+of\s+this\s+directory\?/i)),
    },
    {
        id: 'codex_strong_blocker',
        state: 'awaiting_approval',
        priority: 900,
        region: wholeRecent,
        matcher: any(
            contains('press enter to confirm or esc to cancel'),
            contains('enter to submit answer'),
            contains('allow command?'),
        ),
    },
    {
        id: 'codex_working_fallback',
        state: 'working',
        priority: 500,
        region: bottomLines(3),
        matcher: all(
            lineRegex(/^[•◦]\s+Working \([^)]*esc to interrupt\)/i),
            not(contains('■ conversation interrupted')),
        ),
    },
];

const CURSOR_RULES: readonly RuleSpec[] = [
    {
        id: 'cursor_write_file_approval',
        state: 'awaiting_approval',
        priority: 320,
        region: bottomLines(8),
        matcher: all(
            contains('write to this file?', 'proceed (y)'),
            any(contains('reject & propose changes'), contains('esc or n or p'), contains('add write(')),
        ),
    },
    {
        id: 'cursor_approval_prompt',
        state: 'awaiting_approval',
        priority: 300,
        region: wholeRecent,
        matcher: any(
            all(contains('run this command?'), any(contains('run (once) (y)'), contains('skip (esc or n)'))),
            contains('waiting for approval'),
            contains('(y) (enter)'),
            lineRegex(/^\s*allow .*\(y\)/i),
        ),
    },
    {
        id: 'cursor_stop_hint_working',
        state: 'working',
        priority: 100,
        region: bottomLines(6),
        matcher: contains('ctrl+c to stop'),
    },
    {
        id: 'cursor_spinner_working',
        state: 'working',
        priority: 90,
        region: bottomLines(8),
        matcher: lineRegex(/^\s*(?:⬡|⬢|[⠀-⣿]+)\s+\p{Alphabetic}+\w*ing\b/u),
    },
];

const OPENCODE_RULES: readonly RuleSpec[] = [
    {
        id: 'opencode_permission_required',
        state: 'awaiting_approval',
        priority: 300,
        region: wholeRecent,
        matcher: any(
            contains('△ Permission required'),
            all(contains('esc dismiss'), any(contains('enter confirm'), contains('enter submit'), contains('enter toggle'))),
        ),
    },
    {
        id: 'opencode_interrupt_hint_working',
        state: 'working',
        priority: 110,
        region: wholeRecent,
        matcher: any(
            contains('esc to interrupt'),
            contains('ctrl+c to interrupt'),
            lineRegex(/opencode.*esc (?:again to )?interrupt/i),
        ),
    },
    {
        id: 'opencode_progress_bar_working',
        state: 'working',
        priority: 100,
        region: wholeRecent,
        matcher: regex(/(?:■|⬝){4,}/),
    },
];

const GEMINI_RULES: readonly RuleSpec[] = [
    {
        id: 'gemini_apply_or_allow_change',
        state: 'awaiting_approval',
        priority: 300,
        region: wholeRecent,
        matcher: any(
            contains('│ Apply this change'),
            contains('│ Allow execution'),
            all(contains('yes'), any(contains('waiting for user confirmation'), contains('do you want to proceed'))),
            lineRegex(/^\s*❯.*(?:yes|allow)/i),
        ),
    },
    {
        id: 'gemini_esc_cancel_working',
        state: 'working',
        priority: 100,
        region: wholeRecent,
        matcher: contains('esc to cancel'),
    },
];

const GROK_RULES: readonly RuleSpec[] = [
    {
        id: 'grok_osc_title_blocked',
        state: 'awaiting_approval',
        priority: 1300,
        region: oscTitle,
        matcher: contains('action required'),
    },
    {
        id: 'grok_option_dialog_blocked',
        state: 'awaiting_approval',
        priority: 1200,
        region: wholeRecent,
        matcher: lineRegex(/^\s*┃\s+[0-9a-z]+\s+\([●○]\)\s/),
    },
    {
        id: 'grok_permission_hints_blocked',
        state: 'awaiting_approval',
        priority: 1190,
        region: bottomLines(2),
        matcher: contains(':select', 'ctrl+o:yolo', 'ctrl+c:cancel'),
    },
    {
        id: 'grok_osc_title_idle',
        state: 'agent_idle_prompt',
        priority: 1100,
        region: oscTitle,
        matcher: all(regex(/(?:^| - )grok$/), not(regex(/[⠀-⣿]/))),
    },
    {
        id: 'grok_spinner_status_working',
        state: 'working',
        priority: 200,
        region: wholeRecent,
        matcher: lineRegex(/^\s*[⠁-⣿]\s.*\[stop\]\s*$/),
    },
    {
        id: 'grok_prompt_hints_idle',
        state: 'agent_idle_prompt',
        priority: 100,
        region: bottomLines(2),
        matcher: all(contains('ctrl+.:shortcuts'), not(any(contains('esc:cancel'), contains('ctrl+c:cancel')))),
    },
];

/** The per-runtime rulesets, keyed by canonical runtime id. */
export const AGENT_RULES: Readonly<Record<string, readonly RuleSpec[]>> = {
    claude: CLAUDE_RULES,
    codex: CODEX_RULES,
    cursor: CURSOR_RULES,
    opencode: OPENCODE_RULES,
    gemini: GEMINI_RULES,
    grok: GROK_RULES,
};

/** Runtime aliases → canonical id (mirrors the herdr manifest `aliases`). */
const RUNTIME_ALIASES: Readonly<Record<string, string>> = {
    'claude-code': 'claude',
    'cursor-agent': 'cursor',
    'open-code': 'opencode',
    'grok-build': 'grok',
};

function canonicalRuntime(runtime: string | null | undefined): string | null {
    if (runtime == null) return null;
    const key = runtime.trim().toLowerCase();
    if (key === '') return null;
    return RUNTIME_ALIASES[key] ?? key;
}

/** Agent-specific rules FIRST (so they win priority ties), then the generic set. */
function rulesForRuntime(runtime: string | null | undefined): readonly RuleSpec[] {
    const key = canonicalRuntime(runtime);
    const agentRules = key != null ? (AGENT_RULES[key] ?? []) : [];
    return [...agentRules, ...GENERIC_RULES];
}

// --- evaluator --------------------------------------------------------------

/** The outcome of a manifest evaluation over a captured tail. */
export type ManifestOutcome =
    | { readonly kind: 'signal'; readonly attention: AttentionState; readonly ruleId: string }
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

function recentWindow(tail: string): string {
    const lines = splitLines(tail);
    return lines.slice(-MAX_RECENT_LINES).join('\n');
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
