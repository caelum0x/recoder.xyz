// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// The board's keyboard grammar as PURE data + one derivation. A terminal IDE is
// driven by the keyboard, so every key here maps to a REAL board action — never a
// key that does nothing. Kept free of React/store so the whole grammar (and the
// help overlay that lists it) is unit-testable in isolation, and so the runtime
// handler is a thin dispatch over this single source of truth.

// Every action a board key can produce. Each is wired to an existing capability in
// the view; there is no action here without a real handler.
type RecoderShortcutActionType =
    | "select-next"
    | "select-prev"
    | "open"
    | "new-task"
    | "focus-filter"
    | "converge"
    | "review"
    | "session"
    | "command-palette"
    | "show-shortcuts";

type RecoderShortcutAction = { type: RecoderShortcutActionType };

// The live board state a key needs to resolve to a truthful action. `typing` is
// true when focus is in a text field (the filter/prompt) — board keys stand down
// so typing is never hijacked. The rest gate keys that need a target: navigation
// needs rows, open/review/session/converge need a selected card, and converge
// additionally needs the selected card's group to be genuinely converge-ready.
interface RecoderShortcutContext {
    typing: boolean;
    hasRows: boolean;
    hasSelection: boolean;
    convergeReady: boolean;
}

// The minimal keyboard-event shape the derivation reads — a plain object in tests,
// a real KeyboardEvent at runtime.
type RecoderKeyEvent = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">;

// Pure: map a key press + board state to the action it should perform, or null when
// the key is not a board shortcut in the current state. The command palette and the
// shortcuts overlay are global toggles resolved BEFORE the typing guard, so ⌘P/⌘K
// and ⌘/ still work while a field is focused; every other key stands down while
// typing. `c` returns null unless the selection is genuinely converge-ready, so a
// pick that could not converge is a truthful no-op rather than a dead key.
function deriveShortcutAction(event: RecoderKeyEvent, context: RecoderShortcutContext): RecoderShortcutAction | null {
    // Global toggles: ⌘P/⌘K (palette) and ⌘/ (shortcuts) work everywhere, even mid-type.
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
        const metaKey = event.key.toLowerCase();
        if (metaKey == "p" || metaKey == "k") {
            return { type: "command-palette" };
        }
        if (metaKey == "/") {
            return { type: "show-shortcuts" };
        }
        return null;
    }
    // Any remaining modified key (Alt, or a Ctrl/Meta combo we don't own) is not ours.
    if (event.metaKey || event.ctrlKey || event.altKey) {
        return null;
    }
    // Never hijack typing in the filter/prompt.
    if (context.typing) {
        return null;
    }
    switch (event.key) {
        case "j":
        case "ArrowDown":
            return context.hasRows ? { type: "select-next" } : null;
        case "k":
        case "ArrowUp":
            return context.hasRows ? { type: "select-prev" } : null;
        case "Enter":
            return context.hasSelection ? { type: "open" } : null;
        case "n":
        case "N":
            return { type: "new-task" };
        case "/":
            return { type: "focus-filter" };
        case "?":
            return { type: "show-shortcuts" };
        case "c":
            return context.hasSelection && context.convergeReady ? { type: "converge" } : null;
        case "r":
            return context.hasSelection ? { type: "review" } : null;
        case "s":
            return context.hasSelection ? { type: "session" } : null;
        default:
            return null;
    }
}

// One overlay row: the human-readable keys, a plain-language label, and the action
// it performs. `probe` is a representative key press the row is verified against —
// present for every board shortcut so a test can prove the overlay lists ONLY keys
// that resolve to a real action (and to that exact action).
type RecoderShortcutRow = {
    keys: string;
    label: string;
    action: RecoderShortcutActionType;
    probe: RecoderKeyEvent;
};

type RecoderShortcutGroup = {
    title: string;
    rows: RecoderShortcutRow[];
};

const metaProbe = (key: string): RecoderKeyEvent => ({ key, metaKey: true, ctrlKey: false, altKey: false });
const plainProbe = (key: string): RecoderKeyEvent => ({ key, metaKey: false, ctrlKey: false, altKey: false });

// The shortcuts the overlay lists, grouped navigate/act. This is the SAME grammar
// deriveShortcutAction implements; the overlay renders from it and a test verifies
// each row's probe resolves to its action, so a listed shortcut can never drift out
// of sync with what the board actually does.
const RECODER_SHORTCUT_GROUPS: RecoderShortcutGroup[] = [
    {
        title: "Navigate",
        rows: [
            { keys: "j / k · ↑ / ↓", label: "Move selection", action: "select-next", probe: plainProbe("j") },
            { keys: "↵", label: "Open selected", action: "open", probe: plainProbe("Enter") },
            { keys: "/", label: "Filter", action: "focus-filter", probe: plainProbe("/") },
            { keys: "⌘P / ⌘K", label: "Command palette", action: "command-palette", probe: metaProbe("p") },
            { keys: "?", label: "Keyboard shortcuts", action: "show-shortcuts", probe: plainProbe("?") },
        ],
    },
    {
        title: "Act",
        rows: [
            { keys: "N", label: "New task", action: "new-task", probe: plainProbe("n") },
            { keys: "R", label: "Review selected", action: "review", probe: plainProbe("r") },
            { keys: "S", label: "Session on selected", action: "session", probe: plainProbe("s") },
            { keys: "C", label: "Compare & Converge", action: "converge", probe: plainProbe("c") },
        ],
    },
];

export {
    deriveShortcutAction,
    RECODER_SHORTCUT_GROUPS,
    type RecoderKeyEvent,
    type RecoderShortcutAction,
    type RecoderShortcutActionType,
    type RecoderShortcutContext,
    type RecoderShortcutGroup,
    type RecoderShortcutRow,
};
