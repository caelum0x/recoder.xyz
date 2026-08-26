// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore(), createBlock: vi.fn() };
});

vi.mock("./recoder-status-board", () => ({
    RecoderStatusBoardView: () => null,
}));

import { projectBoard, STATUS_COLUMNS } from "./recoder-status-board-model";

// One raw wire cell, minimally shaped like the backend AttentionState board entry.
function cell(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { workspaceId: "ws-1", agentKind: "claude", nativeStatus: "blocked", ...overrides };
}

describe("projectBoard — untrusted status-board wire projection", () => {
    it("returns a calm empty board for a non-object wire", () => {
        for (const raw of [null, undefined, 7, "nope", []]) {
            const board = projectBoard(raw);
            expect(board.total).toBe(0);
            expect(board.degraded).toBe(false);
            expect(board.reason).toBe("");
            for (const state of STATUS_COLUMNS) {
                expect(board.columns[state]).toEqual([]);
                expect(board.totals[state]).toBe(0);
            }
        }
    });

    it("surfaces the degrade flag and reason verbatim (non-string reason → empty)", () => {
        expect(projectBoard({ degraded: true, reason: "stream closed" })).toMatchObject({
            degraded: true,
            reason: "stream closed",
        });
        // A truthy-but-not-`true` degraded value never fakes a degrade.
        expect(projectBoard({ degraded: 1, reason: 42 })).toMatchObject({ degraded: false, reason: "" });
    });

    it("projects a cell's fields, falling back agentKind→workspaceId and nativeStatus→unknown", () => {
        const board = projectBoard({
            columns: {
                awaiting_approval: [
                    { workspaceId: "ws-a", agentKind: "claude", taskGroup: "grp", nativeStatus: "blocked" },
                    { workspaceId: "ws-b" },
                ],
            },
        });
        expect(board.columns.awaiting_approval).toEqual([
            { workspaceId: "ws-a", agentKind: "claude", taskGroup: "grp", nativeStatus: "blocked" },
            { workspaceId: "ws-b", agentKind: "ws-b", nativeStatus: "unknown" },
        ]);
        // taskGroup is only present when the wire carried a string.
        expect("taskGroup" in board.columns.awaiting_approval[1]).toBe(false);
    });

    it("drops cells with a missing/blank/non-string workspaceId", () => {
        const board = projectBoard({
            columns: {
                working: [cell({ workspaceId: "ws-keep" }), cell({ workspaceId: "" }), cell({ workspaceId: 5 }), "junk", null],
            },
        });
        expect(board.columns.working.map((c) => c.workspaceId)).toEqual(["ws-keep"]);
        expect(board.totals.working).toBe(1);
    });

    it("computes per-column totals and a truthful grand total from the rendered cells", () => {
        const board = projectBoard({
            columns: {
                awaiting_approval: [cell({ workspaceId: "a" })],
                review_ready: [cell({ workspaceId: "b" }), cell({ workspaceId: "c" })],
            },
        });
        expect(board.totals.awaiting_approval).toBe(1);
        expect(board.totals.review_ready).toBe(2);
        expect(board.total).toBe(3);
    });

    it("tolerates non-array / missing / garbage column values without throwing", () => {
        const board = projectBoard({ columns: { working: "not-an-array", error: null, unknown: { nope: 1 } } });
        expect(board.total).toBe(0);
        // A columns value that is itself not an object is ignored entirely.
        expect(projectBoard({ columns: "not-an-object" }).total).toBe(0);
        expect(projectBoard({ columns: [1, 2, 3] }).total).toBe(0);
    });

    it("de-dupes a workspace repeated WITHIN a column (keeps the first, count stays truthful)", () => {
        const board = projectBoard({
            columns: {
                working: [cell({ workspaceId: "dup", agentKind: "first" }), cell({ workspaceId: "dup", agentKind: "second" })],
            },
        });
        expect(board.columns.working).toEqual([{ workspaceId: "dup", agentKind: "first", nativeStatus: "blocked" }]);
        expect(board.totals.working).toBe(1);
        expect(board.total).toBe(1);
    });

    it("de-dupes a workspace repeated ACROSS columns — the most-urgent column wins, total stays truthful", () => {
        // STATUS_COLUMNS is ordered by urgency; awaiting_approval precedes working.
        const board = projectBoard({
            columns: {
                awaiting_approval: [cell({ workspaceId: "ws-x", nativeStatus: "blocked" })],
                working: [cell({ workspaceId: "ws-x", nativeStatus: "working" }), cell({ workspaceId: "ws-y" })],
            },
        });
        expect(board.columns.awaiting_approval.map((c) => c.workspaceId)).toEqual(["ws-x"]);
        expect(board.columns.working.map((c) => c.workspaceId)).toEqual(["ws-y"]);
        expect(board.totals.awaiting_approval).toBe(1);
        expect(board.totals.working).toBe(1);
        // ws-x is billed ONCE, never twice across columns.
        expect(board.total).toBe(2);
    });
});
