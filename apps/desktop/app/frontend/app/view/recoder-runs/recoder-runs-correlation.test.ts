// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    correlateRunToWorkspace,
    correlateRuns,
    parseWorkspaceEvents,
    parseWorkspaceList,
    type WorkspaceCorrelation,
} from "./recoder-runs-correlation";

function ws(overrides: Partial<WorkspaceCorrelation> = {}): WorkspaceCorrelation {
    return {
        workspaceId: "w1",
        taskId: "t1",
        spaceId: "s1",
        ...overrides,
    };
}

describe("parseWorkspaceList", () => {
    it("reads the live envelope { data: { workspaces: [...] } }", () => {
        const body = {
            data: {
                workspaces: [
                    { workspaceId: "w1", taskId: "t1", spaceId: "s1", runId: "r1", runtimeId: "claude", state: "running", updatedAt: "2026-08-01T10:00:00Z" },
                ],
            },
        };
        expect(parseWorkspaceList(body)).toEqual([
            { workspaceId: "w1", taskId: "t1", spaceId: "s1", runId: "r1", runtimeId: "claude", state: "running", updatedAt: "2026-08-01T10:00:00Z" },
        ]);
    });

    it("tolerates a bare { data: [...] } from an older backend", () => {
        const body = { data: [{ workspaceId: "w1", taskId: "t1", spaceId: "s1" }] };
        expect(parseWorkspaceList(body)).toEqual([{ workspaceId: "w1", taskId: "t1", spaceId: "s1" }]);
    });

    it("drops archived workspaces and rows missing a workspaceId", () => {
        const body = {
            data: {
                workspaces: [
                    { workspaceId: "w1", taskId: "t1", spaceId: "s1", state: "running" },
                    { workspaceId: "w2", taskId: "t2", spaceId: "s1", state: "archived" },
                    { taskId: "t3", spaceId: "s1", state: "running" },
                ],
            },
        };
        const out = parseWorkspaceList(body);
        expect(out.map((w) => w.workspaceId)).toEqual(["w1"]);
    });

    it("returns [] for a garbage / missing body without throwing", () => {
        expect(parseWorkspaceList(null)).toEqual([]);
        expect(parseWorkspaceList({})).toEqual([]);
        expect(parseWorkspaceList({ data: { workspaces: "nope" } })).toEqual([]);
        expect(parseWorkspaceList("weird")).toEqual([]);
    });
});

describe("parseWorkspaceEvents", () => {
    it("reads { data: { events: [...] } } preserving oldest→newest order", () => {
        const body = {
            data: {
                events: [
                    { eventId: "e1", type: "started", taskId: "t1", createdAt: "2026-08-01T10:00:00Z" },
                    { eventId: "e2", type: "log", taskId: "t1", message: "hi", createdAt: "2026-08-01T10:01:00Z" },
                ],
            },
        };
        const out = parseWorkspaceEvents(body);
        expect(out.map((e) => e.eventId)).toEqual(["e1", "e2"]);
        expect(out[1].message).toBe("hi");
    });

    it("tolerates a bare { data: [...] } and skips events with no eventId", () => {
        const body = { data: [{ eventId: "e1", type: "log", taskId: "t1", createdAt: "x" }, { type: "log" }] };
        expect(parseWorkspaceEvents(body).map((e) => e.eventId)).toEqual(["e1"]);
    });

    it("returns [] for a garbage / missing body without throwing", () => {
        expect(parseWorkspaceEvents(null)).toEqual([]);
        expect(parseWorkspaceEvents({ data: null })).toEqual([]);
        expect(parseWorkspaceEvents({ data: { events: 3 } })).toEqual([]);
    });
});

describe("correlateRunToWorkspace", () => {
    it("matches on runId first (exact 1:1 link)", () => {
        const workspaces = [ws({ workspaceId: "wA", runId: "rX" }), ws({ workspaceId: "wB", runId: "run-1" })];
        expect(correlateRunToWorkspace({ runId: "run-1", taskId: "t1", spaceId: "s1" }, workspaces)).toBe("wB");
    });

    it("falls back to taskId + spaceId when there is no runId link", () => {
        const workspaces = [ws({ workspaceId: "wA", taskId: "t9", spaceId: "s1" }), ws({ workspaceId: "wB", taskId: "t1", spaceId: "s1" })];
        expect(correlateRunToWorkspace({ runId: "run-1", taskId: "t1", spaceId: "s1" }, workspaces)).toBe("wB");
    });

    it("requires BOTH taskId and spaceId to match (never crosses a space)", () => {
        const workspaces = [ws({ workspaceId: "wA", taskId: "t1", spaceId: "other" })];
        expect(correlateRunToWorkspace({ runId: "run-1", taskId: "t1", spaceId: "s1" }, workspaces)).toBeNull();
    });

    it("disambiguates parallel siblings by assignee agent === runtimeId", () => {
        const workspaces = [
            ws({ workspaceId: "wA", taskId: "t1", spaceId: "s1", runtimeId: "codex", updatedAt: "2026-08-01T12:00:00Z" }),
            ws({ workspaceId: "wB", taskId: "t1", spaceId: "s1", runtimeId: "claude", updatedAt: "2026-08-01T10:00:00Z" }),
        ];
        expect(
            correlateRunToWorkspace({ runId: "run-1", taskId: "t1", spaceId: "s1", assigneeAgentId: "claude" }, workspaces),
        ).toBe("wB");
    });

    it("falls back to the most-recently-updated sibling when the agent does not disambiguate", () => {
        const workspaces = [
            ws({ workspaceId: "wA", taskId: "t1", spaceId: "s1", runtimeId: "codex", updatedAt: "2026-08-01T10:00:00Z" }),
            ws({ workspaceId: "wB", taskId: "t1", spaceId: "s1", runtimeId: "cursor", updatedAt: "2026-08-01T12:00:00Z" }),
        ];
        expect(correlateRunToWorkspace({ runId: "run-1", taskId: "t1", spaceId: "s1" }, workspaces)).toBe("wB");
    });

    it("returns null when nothing links", () => {
        expect(correlateRunToWorkspace({ runId: "r", taskId: "t1", spaceId: "s1" }, [])).toBeNull();
        expect(correlateRunToWorkspace({ runId: "r" }, [ws()])).toBeNull();
    });
});

describe("correlateRuns", () => {
    it("builds a Map<runId, workspaceId> and omits uncorrelated runs", () => {
        const workspaces = [ws({ workspaceId: "wB", runId: "run-1" })];
        const map = correlateRuns(
            [
                { runId: "run-1", taskId: "t1", spaceId: "s1" },
                { runId: "run-2", taskId: "tZ", spaceId: "sZ" },
                { taskId: "t1", spaceId: "s1" },
            ],
            workspaces,
        );
        expect(map.get("run-1")).toBe("wB");
        expect(map.has("run-2")).toBe(false);
        expect(map.size).toBe(1);
    });
});
