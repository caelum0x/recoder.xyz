// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import {
    deriveShortcutAction,
    RECODER_SHORTCUT_GROUPS,
    type RecoderKeyEvent,
    type RecoderShortcutContext,
} from "./recoder-shortcuts-logic";

// A board with rows, a live selection, and a converge-ready group — every gate open
// so each key resolves to its action.
const READY: RecoderShortcutContext = { typing: false, hasRows: true, hasSelection: true, convergeReady: true };

const plain = (key: string): RecoderKeyEvent => ({ key, metaKey: false, ctrlKey: false, altKey: false });
const meta = (key: string): RecoderKeyEvent => ({ key, metaKey: true, ctrlKey: false, altKey: false });

describe("deriveShortcutAction — every key maps to a real action", () => {
    it("navigates the selection with j/k and the arrow keys", () => {
        expect(deriveShortcutAction(plain("j"), READY)).toEqual({ type: "select-next" });
        expect(deriveShortcutAction(plain("ArrowDown"), READY)).toEqual({ type: "select-next" });
        expect(deriveShortcutAction(plain("k"), READY)).toEqual({ type: "select-prev" });
        expect(deriveShortcutAction(plain("ArrowUp"), READY)).toEqual({ type: "select-prev" });
    });

    it("opens the selected workspace on Enter", () => {
        expect(deriveShortcutAction(plain("Enter"), READY)).toEqual({ type: "open" });
    });

    it("maps n to a new task from any board state (no selection required)", () => {
        expect(deriveShortcutAction(plain("n"), READY)).toEqual({ type: "new-task" });
        expect(deriveShortcutAction(plain("N"), READY)).toEqual({ type: "new-task" });
        const emptyBoard = { ...READY, hasRows: false, hasSelection: false };
        expect(deriveShortcutAction(plain("n"), emptyBoard)).toEqual({ type: "new-task" });
    });

    it("focuses the filter on / and opens shortcuts on ?", () => {
        expect(deriveShortcutAction(plain("/"), READY)).toEqual({ type: "focus-filter" });
        expect(deriveShortcutAction(plain("?"), READY)).toEqual({ type: "show-shortcuts" });
    });

    it("maps r/s to review/session on the selected card", () => {
        expect(deriveShortcutAction(plain("r"), READY)).toEqual({ type: "review" });
        expect(deriveShortcutAction(plain("s"), READY)).toEqual({ type: "session" });
    });

    it("maps ⌘P / ⌘K to the palette and ⌘/ to the shortcuts overlay", () => {
        expect(deriveShortcutAction(meta("p"), READY)).toEqual({ type: "command-palette" });
        expect(deriveShortcutAction(meta("k"), READY)).toEqual({ type: "command-palette" });
        expect(deriveShortcutAction(meta("/"), READY)).toEqual({ type: "show-shortcuts" });
    });
});

describe("deriveShortcutAction — the typing guard", () => {
    it("stands down for every board key while typing in a field", () => {
        const typing = { ...READY, typing: true };
        for (const key of ["j", "k", "ArrowDown", "ArrowUp", "Enter", "n", "/", "?", "c", "r", "s"]) {
            expect(deriveShortcutAction(plain(key), typing)).toBeNull();
        }
    });

    it("still lets the global palette/shortcuts toggles through while typing", () => {
        const typing = { ...READY, typing: true };
        expect(deriveShortcutAction(meta("p"), typing)).toEqual({ type: "command-palette" });
        expect(deriveShortcutAction(meta("/"), typing)).toEqual({ type: "show-shortcuts" });
    });
});

describe("deriveShortcutAction — gates that keep keys truthful", () => {
    it("c is a no-op when the selection is not converge-ready", () => {
        expect(deriveShortcutAction(plain("c"), { ...READY, convergeReady: false })).toBeNull();
        expect(deriveShortcutAction(plain("c"), READY)).toEqual({ type: "converge" });
    });

    it("c is a no-op when nothing is selected even if a group is ready", () => {
        expect(deriveShortcutAction(plain("c"), { ...READY, hasSelection: false })).toBeNull();
    });

    it("navigation is a no-op on an empty board", () => {
        const empty = { ...READY, hasRows: false };
        expect(deriveShortcutAction(plain("j"), empty)).toBeNull();
        expect(deriveShortcutAction(plain("k"), empty)).toBeNull();
    });

    it("open/review/session are no-ops with nothing selected", () => {
        const none = { ...READY, hasSelection: false };
        expect(deriveShortcutAction(plain("Enter"), none)).toBeNull();
        expect(deriveShortcutAction(plain("r"), none)).toBeNull();
        expect(deriveShortcutAction(plain("s"), none)).toBeNull();
    });

    it("an unknown key and an unowned modifier combo return null", () => {
        expect(deriveShortcutAction(plain("x"), READY)).toBeNull();
        expect(deriveShortcutAction(plain("1"), READY)).toBeNull();
        expect(deriveShortcutAction({ key: "j", metaKey: false, ctrlKey: false, altKey: true }, READY)).toBeNull();
        expect(deriveShortcutAction(meta("x"), READY)).toBeNull();
    });
});

describe("RECODER_SHORTCUT_GROUPS — the overlay lists ONLY real shortcuts", () => {
    it("groups the shortcuts as navigate / act", () => {
        expect(RECODER_SHORTCUT_GROUPS.map((g) => g.title)).toEqual(["Navigate", "Act"]);
    });

    it("resolves every listed row to its stated action via the real derivation", () => {
        for (const group of RECODER_SHORTCUT_GROUPS) {
            for (const row of group.rows) {
                const action = deriveShortcutAction(row.probe, READY);
                expect(action, `${row.keys} (${row.label})`).not.toBeNull();
                expect(action?.type, `${row.keys} (${row.label})`).toBe(row.action);
            }
        }
    });

    it("lists no duplicate actions", () => {
        const actions = RECODER_SHORTCUT_GROUPS.flatMap((g) => g.rows.map((r) => r.action));
        expect(new Set(actions).size).toBe(actions.length);
    });
});
