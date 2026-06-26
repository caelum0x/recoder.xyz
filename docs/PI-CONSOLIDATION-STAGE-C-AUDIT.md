# Stage C parity audit — Ink↔pi-tui (generated)

**Generated:** 2026-06-26  
**Workflow:** Ink↔pi-tui parity audit for Recoder Code Stage C  
**Agent Count:** 6 (4 inventory agents, 1 matrix builder, 1 completeness critic)  
**Total Tokens:** 515,192  

## Summary Counts

| Category | Count | Notes |
|----------|-------|-------|
| **Ink Features** | 83 | Total inventoried features from recoder-code TUI |
| **pi-tui Native** | 26 | Features already present in pi-tui |
| **Port Required** | 29 | Features needing migration to pi-tui |
| **Drop Candidates** | 13 | Gemini/OpenRouter-specific features not applicable to Recoder |

### High-Risk Ports (8 features)

The following high-effort features are critical for Stage C completion:

1. **Static rendering with message splitting** - Critical performance optimization for long streaming responses
2. **Tool call group rendering** - Bordered box with status-based coloring and emphasis management
3. **Tool approval confirmation UI** - Interactive Yes/No/Allow Always with diff preview
4. **Unified diff renderer** - Line numbers, colored backgrounds, gap indicators for code editing
5. **Height-constrained overflow management** - MaxSizedBox with directional overflow and "Press ctrl-s to show more"
6. **Prompt Completion (Ghost Text)** - AI-powered inline suggestions using Gemini Flash Lite
7. **Vim Mode** - Full modal editing state machine (NORMAL/INSERT, h/j/k/l, operators)
8. **Reverse Search (Ctrl+R)** - Shell-style fuzzy reverse search through command history

## Full Parity Matrix

| Feature | Area | Verdict | Effort | Rationale |
|---------|------|---------|--------|-----------|
| Static rendering with message splitting | TUI chat & streaming rendering | port | high | Critical performance optimization for long streaming responses. pi-tui has streaming markdown but doesn't split messages at safe points for static rendering. This prevents re-rendering of completed history items. Complex: requires finding safe split points in markdown/code blocks. |
| Streaming state management (Idle/Responding/WaitingForConfirmation) | TUI chat & streaming rendering | port | med | Global streaming state is core UX for cancel handling, loading indicators, and input locking. pi-tui has loader but not a comprehensive streaming state enum used across components. |
| History item routing via type discrimination | TUI chat & streaming rendering | port | med | Recoder has many message types (user, assistant, tool_group, compression, summary, about, help, stats, quit, quit_confirmation). pi-tui has basic message types but not Recoder's full set. Central router needed. |
| AI message rendering (gemini/gemini_content) | TUI chat & streaming rendering | port | low | Rename 'gemini' → 'assistant'. Continuation fragments without prefix are important for clean rendering of split messages. pi-tui has markdown but needs this prefix/split handling. |
| Block-level markdown parsing | TUI chat & streaming rendering | native | low | pi-tui's markdown component (packages/pi-tui/src/components/markdown.ts) already handles headings, lists, code blocks, tables, blockquotes. No need to port Ink's custom parser. |
| Inline markdown rendering | TUI chat & streaming rendering | native | low | pi-tui markdown handles inline formatting (bold, italic, links, code). Ink's regex-based parser is redundant. |
| Syntax-highlighted code blocks | TUI chat & streaming rendering | native | low | pi-tui markdown component includes syntax highlighting. Ink's CodeColorizer with lowlight is duplicate functionality. |
| Markdown table renderer | TUI chat & streaming rendering | native | low | pi-tui markdown supports tables with box-drawing characters. Ink's TableRenderer is redundant. |
| Tool call group rendering | TUI chat & streaming rendering | port | high | Recoder-specific UX: bordered box with multiple tools, status-based coloring, single 'confirming' tool highlighted. pi-tui shows tool calls but not this grouped, bordered UX with emphasis management. |
| Individual tool call display | TUI chat & streaming rendering | port | med | Recoder's 6-char status indicator (✓ Pending, spinner, ✓ Success, ? Confirming, ✗ Canceled, ! Error) and strikethrough for canceled is specific UX. pi-tui has tool display but not Recoder's visual language. |
| Tool approval confirmation UI | TUI chat & streaming rendering | port | high | Interactive approval with Yes/No/Allow Always, keyboard shortcuts, diff preview, command args, env vars display. Critical Recoder feature. pi-tui has no equivalent approval UI. |
| Unified diff renderer | TUI chat & streaming rendering | port | high | Valuable UX for code editing with line numbers, colored backgrounds (green/red), gap indicators. pi-tui doesn't have diff rendering. High value for Recoder's editing workflows. |
| Todo list display | TUI chat & streaming rendering | port | low | Recoder's task tracking: ○ pending, ◐ in_progress, ● completed with strikethrough. pi-tui has no todo component. Simple but Recoder-specific. |
| Plan summary display | TUI chat & streaming rendering | port | low | Recoder's planning feature output format. pi-tui doesn't have plan-specific rendering. Low effort (wraps markdown). |
| Subagent execution display | TUI chat & streaming rendering | port | med | Shows subagent status, elapsed time, tool call summary, stats. Recoder multi-agent feature. pi-tui doesn't have subagent display. |
| Height-constrained overflow management | TUI chat & streaming rendering | port | high | MaxSizedBox with directional overflow (top/bottom) and 'Press ctrl-s to show more' indicator. Critical UX for long outputs. pi-tui doesn't have this overflow system. |
| Loading and thinking indicators | TUI chat & streaming rendering | native | low | pi-tui has loader component (packages/pi-tui/src/components/loader.ts) with animated spinner. Thinking state can be added to streaming state enum. No need to port Ink's separate loading components. |
| Message queue for pending input | TUI chat & streaming rendering | port | med | UX improvement: shows up to 3 queued messages with '... (+N more)' indicator. Messages restore to input on cancel. Valuable for user experience during streaming. |
| User message display | TUI chat & streaming rendering | native | low | Simple text rendering with 'You: ' prefix. pi-tui handles this natively in interactive mode. |
| UserShellMessage (shell command output) | TUI chat & streaming rendering | port | low | Recoder has shell mode ('!') with specific styling. pi-tui has bash mode but may need Recoder-specific styling. |
| System info and error messages | TUI chat & streaming rendering | native | low | Basic colored text (blue for info, red for error). pi-tui's theming handles this natively. |
| Theme-based semantic coloring | TUI chat & streaming rendering | native | low | pi-tui has comprehensive theme system (packages/pi-coding-agent/src/modes/interactive/theme/theme.ts) with ~40 color roles. Ink's semantic tokens map directly to pi-tui's theme roles. |
| InputPrompt - Main input component | CLI TUI Input/Prompt UX | native | low | pi-tui has Editor component (packages/pi-tui/src/editor-component.ts) with multi-line input, cursor, focus. No need to port Ink's InputPrompt. |
| Slash Command Palette | CLI TUI Input/Prompt UX | native | low | pi-tui has slash command completion (packages/pi-tui/src/autocomplete.ts) with fuzzy search, hierarchical subcommands, descriptions. Ink's palette is duplicate functionality. |
| @-mention / File Completion | CLI TUI Input/Prompt UX | native | low | pi-tui has file completion (@ prefix) with fd-based fuzzy search (packages/pi-tui/src/autocomplete.ts). Drag-and-drop support may need verification. |
| Prompt Completion (Ghost Text) | CLI TUI Input/Prompt UX | port | high | AI-powered inline suggestions using Gemini Flash Lite. Recoder-specific feature (uses Recoder's model routing). pi-tui doesn't have ghost text. |
| Reverse Search (Ctrl+R) | CLI TUI Input/Prompt UX | port | med | Shell-style reverse search through command history with (r:) prefix indicator. Valuable UX. pi-tui doesn't have reverse search (has history navigation but not fuzzy reverse search). |
| History Navigation | CLI TUI Input/Prompt UX | native | low | pi-tui has history navigation. Shell mode history file is a simple add. |
| Vim Mode | CLI TUI Input/Prompt UX | port | high | HIGH RISK. Modal editing with NORMAL/INSERT, h/j/k/l, word movements, edits (x/a/i/o), operators (dd/cc/cw), counts, repeat (.). Recoder has full Vim implementation. pi-tui has keybindings but not Vim mode. Must port entire Vim state machine. |
| Keybinding System | CLI TUI Input/Prompt UX | native | low | pi-tui has keybinding registry (packages/pi-tui/src/keybindings.ts) with 30+ default bindings, Kitty protocol, modifiers. Ink's system is duplicate. |
| Multiline Editing | CLI TUI Input/Prompt UX | native | low | pi-tui Editor component has full multiline support with visual wrapping, undo/redo. Ink's multiline is duplicate. |
| Suggestions Display | CLI TUI Input/Prompt UX | native | low | pi-tui has select-list component (packages/pi-tui/src/components/select-list.ts) with scrolling, highlighting, descriptions. Ink's suggestions display is duplicate. |
| Clipboard Image Paste | CLI TUI Input/Prompt UX | port | med | Ctrl+V pastes clipboard images as temp files, inserts @path reference. Valuable UX. pi-tui doesn't have clipboard image paste (has image component but not paste handling). |
| External Editor (Ctrl+X) | CLI TUI Input/Prompt UX | port | low | Opens $VISUAL/$EDITOR for multi-line input. Quality of life feature. pi-tui doesn't have external editor integration. |
| Escape Prompt / Double ESC | CLI TUI Input/Prompt UX | port | low | Double ESC clears input with 'press ESC again to clear' prompt. Prevents accidental clears. pi-tui doesn't have this safeguard. |
| Shell Mode (!) | CLI TUI Input/Prompt UX | native | low | pi-tui interactive mode has bash mode (! prefix) with shell history. Ink's shell mode is duplicate. |
| Status Line (Footer) | CLI TUI (Ink/React) | native | low | pi-tui has footer component (packages/pi-coding-agent/src/modes/interactive/components/footer.ts) showing model, cwd, session info. Ink's footer is duplicate functionality. |
| Header with ASCII Art | CLI TUI (Ink/React) | port | low | Recoder branding with gradient ASCII logo, version, social links. pi-tui doesn't have branded header. Low effort but needed for brand identity. |
| Loading Spinner (ink-spinner) | CLI TUI (Ink/React) | native | low | pi-tui has loader component. Ink's ink-spinner is duplicate. |
| Gradient Text (ink-gradient) | CLI TUI (Ink/React) | port | low | Gradient effects for logos and branding. pi-tui doesn't have gradient text. Needed for Recoder brand identity. |
| Memory Usage Display | CLI TUI (Ink/React) | port | low | Live RSS memory indicator in footer (red if >2GB). Valuable monitoring. pi-tui footer doesn't have memory display. |
| Model Stats Display | CLI TUI (Ink/React) | port | med | Modal with API metrics: request counts, error rates, latency, token breakdown. Recoder-specific analytics. pi-tui doesn't have this. |
| Tool Stats Display | CLI TUI (Ink/React) | port | med | Modal with tool call stats: calls per tool, success rates, duration, user decisions. Recoder-specific analytics. pi-tui doesn't have this. |
| Session Stats Display | CLI TUI (Ink/React) | port | med | Modal with session summary: tool calls, success rate, code changes, wall time, agent active time, model usage. Recoder-specific. pi-tui doesn't have this. |
| Model Selection Dialog | CLI TUI (Ink/React) | native | low | pi-tui has model selector (packages/pi-coding-agent/src/modes/interactive/components/model-selector.ts) with filtering, provider grouping. Ink's dialog is duplicate. |
| Model Switch Dialog | CLI TUI (Ink/React) | drop | low | Gemini-specific: prompt when vision input requires model switch. Recoder uses generic model routing; doesn't need Gemini vision-specific switch prompt. |
| Auth Dialog | CLI TUI (Ink/React) | drop | low | Gemini-specific: OpenRouter/Gemini API auth method selection. Recoder uses recoder.xyz auth; doesn't need this multi-provider auth UI. |
| Auth In Progress | CLI TUI (Ink/React) | drop | low | Gemini-specific OAuth waiting state. Recoder's auth flow is different; doesn't need this. |
| Recoder Login Dialog | CLI TUI (Ink/React) | drop | low | Replaced by pi-tui's OAuth selector (packages/pi-coding-agent/src/modes/interactive/components/oauth-selector.ts) which handles Recoder auth generically. |
| Qwen OAuth Progress | CLI TUI (Ink/React) | drop | low | Qwen-specific OAuth with QR code. Recoder doesn't use Qwen OAuth; doesn't need this. |
| API Key Setup Dialog | CLI TUI (Ink/React) | drop | low | OpenRouter-specific API key configuration. Recoder uses recoder.xyz auth; doesn't need OpenRouter-specific setup. |
| Privacy Notices (Gemini/Cloud Free/Cloud Paid) | CLI TUI (Ink/React) | drop | low | Gemini/Google-specific privacy notices for data collection opt-in. Recoder doesn't use Gemini data collection; these are irrelevant. |
| IDE Integration Nudge | CLI TUI (Ink/React) | drop | low | One-time prompt for VS Code/JetBrains integration. Recoder is editor-agnostic (works with any editor); doesn't need IDE-specific nudges. |
| Theme/Color System | CLI TUI (Ink/React) | native | low | pi-tui has comprehensive theme system (packages/pi-coding-agent/src/modes/interactive/theme/theme.ts) with 15+ themes, semantic tokens, runtime switching. Ink's theme system is duplicate. |
| Theme Dialog | CLI TUI (Ink/React) | native | low | pi-tui has theme selection (likely via settings or slash command). Ink's Theme Dialog with live preview is nice-to-have but not critical; pi-tui theme system covers functionality. |
| Settings Dialog | CLI TUI (Ink/React) | native | low | pi-tui has settings list component (packages/pi-tui/src/components/settings-list.ts) with boolean toggles, keyboard navigation. Ink's settings dialog is duplicate. |
| Editor Settings Dialog | CLI TUI (Ink/React) | drop | low | Editor preference selection (VS Code, JetBrains). Recoder is editor-agnostic; doesn't need editor preference dialog. |
| Quit Confirmation Dialog | CLI TUI (Ink/React) | port | med | Quit options: immediately, generate summary, save conversation, cancel. Recoder-specific workflow. pi-tui may have basic quit confirmation but not this rich set of options. |
| Folder Trust Dialog | CLI TUI (Ink/React) | native | low | pi-tui has trust selector (packages/pi-coding-agent/src/modes/interactive/components/trust-selector.ts) for security decisions. Ink's folder trust dialog is duplicate. |
| Workspace Migration Dialog | CLI TUI (Ink/React) | drop | low | Gemini CLI-specific: deprecated workspace-level extensions migration. Recoder doesn't have Gemini workspace extensions; irrelevant. |
| Welcome Back Dialog | CLI TUI (Ink/React) | port | med | Session resumption with last update time, overall goal, plan progress, pending tasks. Valuable UX. pi-tui has session selector but not this rich welcome-back summary. |
| About Box | CLI TUI (Ink/React) | port | low | System info: CLI version, git commit, model, sandbox, OS, auth method. Useful for debugging. Low effort. |
| Tips | CLI TUI (Ink/React) | port | low | Getting started tips: @file.txt context, RECODER.md, help/setup/model commands. Valuable onboarding. pi-tui may have help but not Recoder-specific tips. |
| Help | CLI TUI (Ink/React) | port | med | Comprehensive help: basics, commands list, keyboard shortcuts. Recoder-specific content. pi-tui has generic help but needs Recoder command reference. |
| Update Notification | CLI TUI (Ink/React) | port | low | Yellow-banner notification for available updates. Useful for user awareness. pi-tui doesn't have this. |
| Context Usage Display | CLI TUI (Ink/React) | native | low | Token count percentage indicator. pi-tui footer likely shows context usage or can be added easily. |
| Context Summary Display | CLI TUI (Ink/React) | port | low | Shows included file count and total tokens. Useful for debugging context. Low effort. |
| Session Summary Display | CLI TUI (Ink/React) | port | low | Session token usage and cost summary. Valuable for cost tracking. pi-tui doesn't have this. |
| Console Summary Display | CLI TUI (Ink/React) | port | low | Error count indicator in footer linking to console details. Useful for debugging. Low effort. |
| Detailed Messages Display | CLI TUI (Ink/React) | drop | low | Expanded view with timestamps. Redundant with history scrolling. pi-tui has session selector and message history; this is duplicate. |
| History Item Display | CLI TUI (Ink/React) | native | low | Individual conversation item. pi-tui's message history covers this. |
| Todo Display | CLI TUI (Ink/React) | port | low | Already covered in TUI section, but appears in list here. Same decision: port for Recoder task tracking. |
| Plan Summary Display | CLI TUI (Ink/React) | port | low | Already covered in TUI section. Same decision: port for Recoder planning features. |
| Suggestions Display | CLI TUI (Ink/React) | native | low | Already covered in Input/Prompt section. pi-tui select-list covers this. |
| Show More Lines | CLI TUI (Ink/React) | port | high | Part of overflow management system. Covered under Height-constrained overflow management. |
| Auto Accept Indicator | CLI TUI (Ink/React) | port | low | Visual indicator for auto-accept mode. Recoder-specific UX for tool approval mode. Low effort. |
| Debug Profiler | CLI TUI (Ink/React) | port | low | Debug mode indicator in footer. Useful for development. Low effort. |
| Shell Mode Indicator | CLI TUI (Ink/React) | native | low | pi-tui bash mode has indicators. Ink's shell mode indicator is duplicate. |
| Shell Confirmation Dialog | CLI TUI (Ink/React) | port | low | Confirmation for shell command execution with command preview. Safety feature. pi-tui may have basic confirmation but not this UX. |
| Prepare Label | CLI TUI (Ink/React) | drop | low | Gemini-specific 'prepare' status label. Recoder doesn't use this terminology; can be dropped or renamed to 'planning'. |
| Radio Button Select (Shared) | CLI TUI (Ink/React) | native | low | pi-tui has select-list component with keyboard navigation. Ink's radio button select is duplicate. |
| Text Input (Shared) | CLI TUI (Ink/React) | native | low | pi-tui has input component (packages/pi-tui/src/components/input.ts). Ink's text input is duplicate. |
| Max Sized Box (Shared) | CLI TUI (Ink/React) | port | high | Container with size constraints and overflow handling. Part of overflow management system. Covered under Height-constrained overflow management. |
| Links (ink-link) | CLI TUI (Ink/React) | native | low | Clickable URLs via OSC 8. pi-tui markdown supports OSC 8 hyperlinks. Ink's ink-link is duplicate. |

## Critic's Verdict

**Verdict:** gaps-found

The completeness critic identified significant gaps in the parity matrix:

### Missing Features (22)

1. **Screen reader accessibility** - Full ARIA labels system (aria-label on all user-facing elements, useIsScreenReaderEnabled() hook, SCREEN_READER_* prefixes) - pi-tui has no accessibility infrastructure
2. **Compression message display** - Shows compression progress with spinner and stats (originalTokenCount → newTokenCount)
3. **Summary message display** - Shows project summary generation progress with stages (generating/saving/completed)
4. **Subagent management UI** - Full agent CRUD (create/edit/view/delete agents) with tool selectors, model selectors, color pickers
5. **Subagent execution display** - Real-time agent status with compact/default/verbose modes, keyboard shortcuts (ctrl+r/ctrl+e)
6. **Message queue for pending input** - Shows up to 3 queued messages with '... (+N more)' indicator, restores to input on cancel
7. **Trust status in footer** - Shows '⚠️ untrusted folder' indicator when folder is not trusted
8. **Sandbox type display in footer** - Shows 🔒 with sandbox type (macOS Seatbelt profile, etc.)
9. **Corgi mode indicator** - Special footer indicator for corgi mode with colored (´ᴥ`) doge face
10. **Branch name display in footer** - Shows (branchName*) asterisk for dirty working tree
11. **Prepare label** - Shows 'prepare' status for planning phase (matrix says drop but Recoder uses this terminology)
12. **Stats display** - Modal with session summary: tool calls, success rate, code changes, wall time, agent active time
13. **Model stats display** - Modal with API metrics: request counts, error rates, latency, token breakdown
14. **Tool stats display** - Modal with tool call stats: calls per tool, success rates, duration, user decisions
15. **Quit confirmation** - Rich dialog with options: immediately, generate summary, save conversation, cancel
16. **Welcome back dialog** - Session resumption with last update time, overall goal, plan progress, pending tasks
17. **Nightly build indication** - Gradient-colored version display for nightly builds in header
18. **Detailed messages display** - Expanded view with timestamps linking to console details
19. **IDE mode integration** - Special handling for IDE mode with diff resolution callbacks
20. **Escape prompt safeguard** - Double ESC to clear input with 'press ESC again to clear' prompt
21. **Prompt queue display** - Visual indicator showing queued messages during streaming
22. **Agents manager dialog** - Complex multi-step wizard for agent lifecycle management

### Questionable Verdicts (14)

Features marked "native" that may require porting due to implementation gaps:

1. **Block-level markdown parsing** - pi-tui's Markdown class exists but lacks Ink's incremental rendering pipeline that safely handles partial closing fences during streaming
2. **Syntax-highlighted code blocks** - pi-tui markdown has optional highlightCode callback but doesn't include the actual syntax highlighting engine (Ink bundles lowlight)
3. **Markdown table renderer** - pi-tui markdown doesn't show table rendering implementation (Ink has dedicated TableRenderer with box-drawing characters)
4. **Loading and thinking indicators** - pi-tui has Loader and CancellableLoader but Ink's system is tied to StreamingState enum with screen reader fallbacks
5. **History Navigation** - pi-tui has history but Ink has separate shell history file for shell mode (not accounted for)
6. **Keybinding System** - pi-tui has keybindings.ts but Ink's system includes 1500+ lines of platform-specific handling (depth may not be equivalent)
7. **Theme-based semantic coloring** - pi-tui has theme.ts but Ink's semantic-colors.ts maps 20+ semantic tokens to theme roles (mapping layer may not exist)
8. **Context Usage Display** - Matrix says 'pi-tui footer likely shows context usage' but this is uncertain (Ink has explicit ContextUsageDisplay component)
9. **Shell Mode** - pi-tui has bash mode but Ink's ShellConfirmationDialog is a complex bordered confirmation UI (confirmation UX is different)
10. **Model Switch Dialog** - Matrix says 'drop' as Gemini-specific, but Recoder uses model routing (underlying need for capability mismatch prompting may still apply)
11. **Settings Dialog** - pi-tui has SettingsList but Ink's SettingsDialog is a full dialog with boolean toggles (feature parity isn't clear)
12. **Radio Button Select (Shared)** - pi-tui has SelectList but Ink's RadioButtonSelect is specifically for confirmation options (UI pattern may not be the same)
13. **Text Input (Shared)** - pi-tui has Input but Ink's TextInput is a shared component (equivalence is uncertain without comparison)
14. **Max Sized Box (Shared)** - pi-tui has no MaxSizedBox equivalent - its overflow handling is at render-time (fundamentally different from Ink's component)

## Gate Decision

**Stage C is NOT a safe blind flip.**

The critic found gaps (verdict=gaps-found). Stage C remains gated until the following high-risk ports are deliberately ported or dropped:

1. Tool approval confirmation UI
2. Unified diff renderer
3. Height-constrained overflow management
4. Prompt Completion (Ghost Text)
5. Vim Mode
6. Reverse Search (Ctrl+R)
7. Static rendering with message splitting
8. Tool call group rendering
9. Screen reader accessibility infrastructure

Do NOT flip pi-tui to default until these features are reviewed and either ported or explicitly dropped with user-facing migration documentation.
