/**
 * Per-agent attention rule corpus — the full detection ruleset for every
 * Recoder runtime that has a herdr detection manifest.
 *
 * ATTRIBUTION (Apache-2.0): the rule CONTENT here is ported directly from
 * herdr's terminal detection manifests
 * (github.com/herdrdev/herdr, `src/detect/manifests/*.toml`, licensed under the
 * Apache License, Version 2.0). herdr's TOML rules are re-expressed 1:1 into
 * Recoder's {@link RuleSpec} vocabulary — regions, matchers, priorities and
 * skip-state semantics are preserved faithfully. herdr's own type names are NOT
 * used, and herdr's `idle`-fallback default is deliberately DROPPED in favour of
 * Recoder's truthfulness invariant (a tail that matches NO rule yields no
 * signal, never a fabricated state).
 *
 *   Copyright (c) Recoder.
 *   Rule corpus ported from herdr, Copyright (c) herdr contributors, licensed
 *   under the Apache License, Version 2.0. You may obtain a copy of the License
 *   at http://www.apache.org/licenses/LICENSE-2.0
 *
 * STATE MAP (herdr -> Recoder AttentionState):
 *   working -> 'working'   blocked -> 'awaiting_approval'
 *   idle    -> 'agent_idle_prompt'   unknown+skip_state_update -> skip ('unknown')
 *
 * REGION MAP (herdr -> {@link Region}):
 *   osc_title -> oscTitle   whole_recent -> wholeRecent
 *   bottom_non_empty_lines(n) -> bottomLines(n)
 *   top_non_empty_lines(n) -> topLines(n)
 *   after_last_horizontal_rule -> afterLastHorizontalRule
 *   prompt_box_body -> promptBoxBody
 *   after_last_prompt_marker -> wholeRecent (Recoder has no prompt-marker slice)
 *
 * DROPPED SURFACES: herdr's `osc_progress` (OSC 9;4) rules are omitted — the
 * Recoder substrate does not capture a progress surface, so those rules would
 * never fire and are left out rather than faked.
 */
import {
  type RuleSpec,
  wholeRecent,
  oscTitle,
  bottomLines,
  topLines,
  afterLastHorizontalRule,
  promptBoxBody,
  contains,
  regex,
  lineRegex,
  all,
  any,
  not,
} from './attention-manifests-core.js';

// --- claude (aliases: claude-code) ------------------------------------------

const CLAUDE_RULES: readonly RuleSpec[] = [
  {
    id: 'claude_osc_title_working',
    state: 'working',
    priority: 1100,
    region: oscTitle,
    matcher: regex(/^[⠀-⣿] /),
  },
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
        contains('ctrl+e', 'collapse'),
        contains('↑↓ scroll'),
        contains('? for shortcuts')
      )
    ),
  },
  {
    id: 'claude_live_blocked_form',
    state: 'awaiting_approval',
    priority: 980,
    region: afterLastHorizontalRule,
    matcher: all(
      contains('esc to cancel'),
      any(
        contains('enter to confirm'),
        all(
          contains('enter to select'),
          any(
            contains('tab/arrow keys to navigate'),
            contains('arrow keys to navigate'),
            contains('arrows to navigate'),
            contains('↑/↓ to navigate'),
            contains('↑↓ to navigate')
          )
        )
      )
    ),
  },
  {
    id: 'claude_dynamic_workflow_prompt',
    state: 'awaiting_approval',
    priority: 980,
    region: wholeRecent,
    matcher: contains('run a dynamic workflow?', 'esc to cancel'),
  },
  {
    id: 'claude_btw_overlay_working',
    state: 'working',
    priority: 975,
    region: bottomLines(5),
    matcher: all(
      lineRegex(/^\s*\/btw(?:\s|$)/),
      lineRegex(/esc to close\s*$/i)
    ),
  },
  {
    id: 'claude_live_prompt_box',
    state: 'agent_idle_prompt',
    priority: 950,
    region: promptBoxBody,
    matcher: all(
      lineRegex(/^\s*❯/),
      not(
        any(
          contains('enter to select'),
          contains('esc to cancel'),
          contains('tab/arrow keys'),
          contains('arrow keys to navigate'),
          contains('↑/↓ to navigate')
        )
      )
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
      not(any(contains('do you want to proceed?'), contains('enter to select')))
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
        contains('ctrl+e to explain')
      ),
      any(
        lineRegex(/^\s*❯?\s*yes\b/i),
        lineRegex(/^\s*1\.\s*yes\b/i),
        lineRegex(/^\s*2\.\s*no\b/i)
      )
    ),
  },
  {
    id: 'claude_generic_permission_prompt',
    state: 'awaiting_approval',
    priority: 840,
    region: afterLastHorizontalRule,
    matcher: all(
      contains('do you want to proceed?', 'esc to cancel'),
      any(
        lineRegex(/^\s*❯?\s*1\.\s*yes\b/i),
        lineRegex(/^\s*2\.\s*yes\b/i),
        lineRegex(/^\s*2\.\s*no\b/i),
        lineRegex(/^\s*3\.\s*no\b/i)
      )
    ),
  },
  {
    id: 'claude_legacy_no_prompt_blocker',
    state: 'awaiting_approval',
    priority: 300,
    region: wholeRecent,
    matcher: all(
      any(
        all(contains('do you want to'), any(contains('yes'), contains('❯'))),
        all(contains('would you like to'), any(contains('yes'), contains('❯'))),
        contains('waiting for permission'),
        contains('do you want to allow this connection?'),
        contains('tab to amend'),
        contains('ctrl+e to explain'),
        contains('do you want to proceed?', 'esc to cancel'),
        contains('review your answers'),
        contains('skip interview and plan immediately')
      ),
      not(regex(/^\s*❯\s*$/m))
    ),
  },
  {
    id: 'claude_osc_title_idle',
    state: 'agent_idle_prompt',
    priority: 250,
    region: oscTitle,
    matcher: regex(/^✳ /),
  },
];

// --- codex ------------------------------------------------------------------

const CODEX_RULES: readonly RuleSpec[] = [
  {
    id: 'codex_osc_title_blocked',
    state: 'awaiting_approval',
    priority: 1100,
    region: oscTitle,
    matcher: contains('action required'),
  },
  {
    id: 'codex_osc_title_working',
    state: 'working',
    priority: 1050,
    region: oscTitle,
    matcher: regex(/(?:^| )[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏](?: |$)/),
  },
  {
    id: 'codex_transcript_viewer',
    state: 'unknown',
    priority: 1000,
    // herdr after_last_prompt_marker -> wholeRecent (no prompt-marker slice).
    region: wholeRecent,
    skipStateUpdate: true,
    matcher: all(
      contains(
        '↑/↓ to scroll',
        'pgup/pgdn to',
        'home/end to jump',
        'q to quit'
      ),
      any(contains('esc to edit prev'), contains('esc/← to edit prev'))
    ),
  },
  {
    id: 'codex_trust_directory',
    state: 'awaiting_approval',
    priority: 950,
    region: topLines(20),
    matcher: all(
      regex(/^> You are in [^\r\n]+/m),
      regex(/Do\s+you\s+trust\s+the\s+contents\s+of\s+this\s+directory\?/i)
    ),
  },
  {
    id: 'codex_live_strong_blocker',
    state: 'awaiting_approval',
    priority: 900,
    region: wholeRecent,
    matcher: any(
      contains('press enter to confirm or esc to cancel'),
      contains('enter to submit answer'),
      contains('enter to submit all'),
      contains('allow command?')
    ),
  },
  {
    id: 'codex_weak_blocker',
    state: 'awaiting_approval',
    priority: 600,
    region: wholeRecent,
    matcher: any(
      contains('[y/n]'),
      contains('yes (y)'),
      all(contains('do you want to'), any(contains('yes'), contains('❯'))),
      all(contains('would you like to'), any(contains('yes'), contains('❯')))
    ),
  },
  {
    id: 'codex_screen_working_fallback',
    state: 'working',
    priority: 500,
    region: bottomLines(3),
    matcher: all(
      lineRegex(/^[•◦]\s+Working \([^)]*esc to interrupt\)(?: · .*)?$/i),
      not(contains('■ conversation interrupted'))
    ),
  },
  {
    id: 'codex_osc_title_idle',
    state: 'agent_idle_prompt',
    priority: 100,
    region: oscTitle,
    matcher: all(
      regex(/\S/),
      not(regex(/(?:^| )[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏](?: |$)/)),
      not(contains('action required'))
    ),
  },
];

// --- cursor (aliases: cursor-agent) -----------------------------------------

const CURSOR_RULES: readonly RuleSpec[] = [
  {
    id: 'cursor_write_file_approval',
    state: 'awaiting_approval',
    priority: 320,
    region: bottomLines(8),
    matcher: all(
      contains('write to this file?', 'proceed (y)'),
      any(
        contains('reject & propose changes'),
        contains('esc or n or p'),
        contains('add write(')
      )
    ),
  },
  {
    id: 'cursor_approval_prompt',
    state: 'awaiting_approval',
    priority: 300,
    region: wholeRecent,
    matcher: any(
      all(
        contains('waiting for approval', 'run this command?'),
        any(contains('run (once) (y)'), contains('skip (esc or n)'))
      ),
      contains('(y) (enter)'),
      lineRegex(/^\s*allow .*\(y\)/i),
      contains('keep (n)'),
      contains('skip (esc or n)'),
      lineRegex(/^\s*(?:→\s*)?run .*\(y\)/i)
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
    id: 'cursor_background_task_status_working',
    state: 'working',
    priority: 95,
    region: bottomLines(5),
    matcher: lineRegex(/\b[1-9][0-9]*\s+background\s+tasks?\b/i),
  },
  {
    id: 'cursor_spinner_working',
    state: 'working',
    priority: 90,
    region: bottomLines(8),
    matcher: lineRegex(/^\s*(?:⬡|⬢|[⠀-⣿]+)\s+\p{Alphabetic}+\w*ing\b/u),
  },
];

// --- opencode (aliases: open-code, herdr:opencode) --------------------------

const OPENCODE_RULES: readonly RuleSpec[] = [
  {
    id: 'opencode_permission_required',
    state: 'awaiting_approval',
    priority: 300,
    region: wholeRecent,
    matcher: any(
      contains('△ Permission required'),
      all(
        contains('esc dismiss'),
        any(
          contains('enter confirm'),
          contains('enter submit'),
          contains('enter toggle')
        ),
        any(contains('↑↓ select'), contains('⇆ tab'))
      )
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
      contains('press esc to interrupt'),
      lineRegex(/opencode.*esc (?:again to )?interrupt/i)
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

// --- gemini (aliases: gemini_cli) -------------------------------------------

const GEMINI_RULES: readonly RuleSpec[] = [
  {
    id: 'gemini_apply_or_allow_change',
    state: 'awaiting_approval',
    priority: 300,
    region: wholeRecent,
    matcher: any(
      contains('│ Apply this change'),
      contains('│ Allow execution'),
      all(
        contains('yes'),
        any(
          contains('waiting for user confirmation'),
          contains('│ Do you want to proceed'),
          contains('do you want to proceed?')
        )
      ),
      lineRegex(/^\s*❯.*(?:yes|allow)/i)
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

// --- grok (aliases: grok-build) ---------------------------------------------

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
    id: 'grok_question_dialog_hints_blocked',
    state: 'awaiting_approval',
    priority: 1185,
    region: bottomLines(2),
    matcher: contains('tab:scrollback', 'shift+x:dismiss'),
  },
  {
    id: 'grok_permission_scope_selector',
    state: 'awaiting_approval',
    priority: 1180,
    region: wholeRecent,
    matcher: all(
      contains('yes, proceed', 'no, reject'),
      any(
        contains('use ← → to choose permission whitelist scope'),
        contains('←/→:scope')
      )
    ),
  },
  {
    id: 'grok_background_work_chip_working',
    state: 'working',
    priority: 1170,
    region: topLines(1),
    matcher: lineRegex(/[⋅:⸬⁙.·]\s+[1-9][0-9]*\s+│/),
  },
  {
    id: 'grok_osc_title_idle',
    state: 'agent_idle_prompt',
    priority: 1100,
    region: oscTitle,
    matcher: all(regex(/(?:^| - )grok$/), not(regex(/[⠀-⣿]/))),
  },
  {
    id: 'grok_osc_title_working',
    state: 'working',
    priority: 1000,
    region: oscTitle,
    matcher: regex(/\S/),
  },
  {
    id: 'grok_spinner_status_working',
    state: 'working',
    priority: 200,
    region: wholeRecent,
    matcher: lineRegex(/^\s*[⠁-⣿]\s.*\[stop\]\s*$/),
  },
  {
    id: 'grok_esc_cancel_hints_working',
    state: 'working',
    priority: 190,
    region: bottomLines(2),
    matcher: contains('esc:cancel', 'ctrl+.:shortcuts'),
  },
  {
    id: 'grok_waiting_tool_working',
    state: 'working',
    priority: 120,
    region: wholeRecent,
    matcher: any(
      all(
        contains('ctrl+c:cancel', 'ctrl+enter:interject'),
        contains('waiting')
      ),
      lineRegex(/^\s*[⠁-⣿]\s+(?:Run|Read|Search|List)\b/)
    ),
  },
  {
    id: 'grok_prompt_hints_idle',
    state: 'agent_idle_prompt',
    priority: 100,
    region: bottomLines(2),
    matcher: all(
      contains('ctrl+.:shortcuts'),
      not(any(contains('esc:cancel'), contains('ctrl+c:cancel')))
    ),
  },
];

// --- pi (aliases: herdr:pi) -------------------------------------------------

const PI_RULES: readonly RuleSpec[] = [
  {
    id: 'pi_working_literal',
    state: 'working',
    priority: 100,
    region: wholeRecent,
    matcher: contains('working...'),
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
  pi: PI_RULES,
};
