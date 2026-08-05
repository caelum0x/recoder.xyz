// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    isPrimaryChord,
    nextFileIndex,
    PRIMARY_CHORD_HINT,
    reviewKeyAction,
    type ReviewKeyEvent,
} from "./recoder-diff-review-keys";

function ev(partial: Partial<ReviewKeyEvent> & { key: string }): ReviewKeyEvent {
    return { typing: false, ...partial };
}

describe("reviewKeyAction — primary accelerator", () => {
    it("fires the primary on the mod+Enter chord when a primary is available", () => {
        expect(reviewKeyAction(ev({ key: "Enter", metaKey: true }), true)).toBe("primary");
        expect(reviewKeyAction(ev({ key: "Enter", ctrlKey: true }), true)).toBe("primary");
    });

    it("does NOT fire the primary when the state is blocked (no loud action to take)", () => {
        expect(reviewKeyAction(ev({ key: "Enter", metaKey: true }), false)).toBeNull();
        expect(reviewKeyAction(ev({ key: "Enter", ctrlKey: true }), false)).toBeNull();
    });

    it("ignores a bare Enter — it belongs to whatever control has focus, not the primary", () => {
        expect(reviewKeyAction(ev({ key: "Enter" }), true)).toBeNull();
    });
});

describe("reviewKeyAction — file-jump nav", () => {
    it("maps j / ArrowDown to the next file and k / ArrowUp to the previous", () => {
        expect(reviewKeyAction(ev({ key: "j" }), true)).toBe("file-next");
        expect(reviewKeyAction(ev({ key: "ArrowDown" }), true)).toBe("file-next");
        expect(reviewKeyAction(ev({ key: "k" }), true)).toBe("file-prev");
        expect(reviewKeyAction(ev({ key: "ArrowUp" }), true)).toBe("file-prev");
    });

    it("does not treat a MODIFIED j/k/arrow as file nav (leaves OS/chords alone)", () => {
        expect(reviewKeyAction(ev({ key: "j", metaKey: true }), true)).toBeNull();
        expect(reviewKeyAction(ev({ key: "k", ctrlKey: true }), true)).toBeNull();
        expect(reviewKeyAction(ev({ key: "ArrowDown", altKey: true }), true)).toBeNull();
    });

    it("navigates files regardless of primary availability (nav is never the loud action)", () => {
        expect(reviewKeyAction(ev({ key: "j" }), false)).toBe("file-next");
        expect(reviewKeyAction(ev({ key: "k" }), false)).toBe("file-prev");
    });
});

describe("reviewKeyAction — typing guard", () => {
    it("returns null for EVERY mapped key while the reviewer is composing a comment", () => {
        for (const key of ["j", "k", "ArrowDown", "ArrowUp"]) {
            expect(reviewKeyAction(ev({ key, typing: true }), true)).toBeNull();
        }
        expect(reviewKeyAction(ev({ key: "Enter", metaKey: true, typing: true }), true)).toBeNull();
    });

    it("maps an unrelated key to null (never a fabricated action)", () => {
        expect(reviewKeyAction(ev({ key: "x" }), true)).toBeNull();
        expect(reviewKeyAction(ev({ key: " " }), true)).toBeNull();
    });
});

describe("nextFileIndex", () => {
    it("clamps at the ends and never leaves the list", () => {
        expect(nextFileIndex(0, 3, -1)).toBe(0);
        expect(nextFileIndex(2, 3, 1)).toBe(2);
        expect(nextFileIndex(1, 3, 1)).toBe(2);
        expect(nextFileIndex(1, 3, -1)).toBe(0);
    });

    it("clamps an out-of-range cursor into the list (delta 0 normalizes it)", () => {
        expect(nextFileIndex(9, 3, 0)).toBe(2);
        expect(nextFileIndex(-4, 3, 0)).toBe(0);
    });

    it("stays at 0 for an empty list", () => {
        expect(nextFileIndex(0, 0, 1)).toBe(0);
        expect(nextFileIndex(5, 0, -1)).toBe(0);
    });
});

describe("isPrimaryChord / PRIMARY_CHORD_HINT", () => {
    it("recognizes the mod+Enter chord and nothing else", () => {
        expect(isPrimaryChord(ev({ key: "Enter", metaKey: true }))).toBe(true);
        expect(isPrimaryChord(ev({ key: "Enter", ctrlKey: true }))).toBe(true);
        expect(isPrimaryChord(ev({ key: "Enter" }))).toBe(false);
        expect(isPrimaryChord(ev({ key: "j", metaKey: true }))).toBe(false);
    });

    it("exposes a compact return-key hint for the label", () => {
        expect(PRIMARY_CHORD_HINT).toContain("⏎");
    });
});
