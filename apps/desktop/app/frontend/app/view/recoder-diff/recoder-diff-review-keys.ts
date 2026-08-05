// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// The keyboard grammar for the Review (diff) surface — where the reviewer DECIDES.
// Pure key→intent mapping so the view's keydown handler stays a thin dispatcher and
// the grammar is unit-tested without a DOM. Two intents only: fire the ONE
// state-chosen primary action (merge / create-pr) via a mod+Enter chord, and move
// the file-jump cursor with j/k or the arrows. Everything is suppressed while the
// reviewer is typing (composing an inline comment) so a review key never eats a
// keystroke meant for the textarea. Nothing here touches jotai/fetch/DOM.

// The intent the view acts on. "primary" activates the loud header action the state
// already chose (reviewPrimaryAction); the file-* intents move the jump cursor.
type ReviewKeyIntent = "primary" | "file-next" | "file-prev" | null;

// A DOM-free view of a keydown. `typing` is resolved by the caller from the event
// target (an editable field), keeping this helper free of any DOM dependency.
type ReviewKeyEvent = {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    typing: boolean;
};

// The mod+Enter chord that fires the primary action — the same ⌘Enter muscle memory
// the hub's Launch chord uses, so the one loud button has one accelerator. Surfaced
// in the button label via PRIMARY_CHORD_HINT.
function isPrimaryChord(event: ReviewKeyEvent): boolean {
    return event.key == "Enter" && (event.metaKey == true || event.ctrlKey == true);
}

// Pure: map a keydown to a Review intent. `primaryAvailable` is the truthful gate —
// when the state is blocked (or the action is in flight) the chord maps to NOTHING,
// so the accelerator never fires an action the header itself refuses to show.
function reviewKeyAction(event: ReviewKeyEvent, primaryAvailable: boolean): ReviewKeyIntent {
    // The typing-guard the whole grammar depends on: never steal a keystroke while
    // the reviewer is composing a comment.
    if (event.typing) {
        return null;
    }
    if (isPrimaryChord(event)) {
        return primaryAvailable ? "primary" : null;
    }
    // File-jump nav is bare-key only: a modified j/k/arrow belongs to the OS or a
    // different chord, never the cursor.
    if (event.metaKey == true || event.ctrlKey == true || event.altKey == true) {
        return null;
    }
    if (event.key == "j" || event.key == "ArrowDown") {
        return "file-next";
    }
    if (event.key == "k" || event.key == "ArrowUp") {
        return "file-prev";
    }
    return null;
}

// Clamp the file-jump cursor. `delta` is +1 (next) / -1 (prev); the result never
// leaves [0, count-1], and an empty list stays at 0 — mirrors the hub board's
// min/max clamp so the two surfaces navigate identically.
function nextFileIndex(current: number, count: number, delta: number): number {
    if (count <= 0) {
        return 0;
    }
    const next = current + delta;
    if (next < 0) {
        return 0;
    }
    if (next > count - 1) {
        return count - 1;
    }
    return next;
}

// The compact chord glyph shown on the primary button's label (⌘ + return). Kept in
// one place so the label and the grammar never drift.
const PRIMARY_CHORD_HINT = "⌘⏎";

export {
    isPrimaryChord,
    nextFileIndex,
    PRIMARY_CHORD_HINT,
    reviewKeyAction,
    type ReviewKeyEvent,
    type ReviewKeyIntent,
};
