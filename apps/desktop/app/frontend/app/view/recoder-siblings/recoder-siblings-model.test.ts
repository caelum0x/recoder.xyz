// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-siblings", () => ({
    RecoderSiblingsView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderSiblingsViewModel } from "./recoder-siblings-model";

const WorkspaceId = "ws-recv";
const EventsUrl = `http://127.0.0.1:3100/api/conductor/workspaces/${WorkspaceId}/events`;

function makeModel(): RecoderSiblingsViewModel {
    return new RecoderSiblingsViewModel({ blockId: "b1" } as ViewModelInitType);
}

// One `sibling_context_delivered` evidence RunEvent as the events edge shapes it
// (backend/src/domains/conductor/adapters/sibling-awareness.adapter.ts): type
// "log", the discriminator + provenance on `data`, the delivery line on `message`.
function deliveredEvent(opts: {
    from: string;
    to: string;
    milestone?: string;
    message: string;
    createdAt: string;
}): Record<string, unknown> {
    const data: Record<string, unknown> = {
        kind: "sibling_context_delivered",
        workspaceId: opts.to,
        fromWorkspaceId: opts.from,
        agent: "claude",
    };
    if (opts.milestone != null) {
        data.milestone = opts.milestone;
    }
    return {
        eventId: `evt-${opts.createdAt}`,
        type: "log",
        taskId: "task-1",
        createdAt: opts.createdAt,
        message: opts.message,
        data,
    };
}

function mockEventsFetch(events: unknown[]) {
    return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { events } }),
    });
}

describe("RecoderSiblingsViewModel.load", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("projects delivered sibling events in chronological order, filtering out non-sibling events", async () => {
        const events = [
            { type: "started", taskId: "t", createdAt: "2026-08-11T10:00:00.000Z" },
            deliveredEvent({
                from: "ws-a",
                to: WorkspaceId,
                milestone: "first_diff",
                message: "[sibling_context_delivered] progress from claude (ws-a)",
                createdAt: "2026-08-11T10:01:00.000Z",
            }),
            {
                type: "log",
                taskId: "t",
                createdAt: "2026-08-11T10:01:30.000Z",
                message: "ordinary log",
                data: { source: "run" },
            },
            deliveredEvent({
                from: "ws-a",
                to: WorkspaceId,
                message: "[sibling_context_delivered] from claude (ws-a)",
                createdAt: "2026-08-11T10:02:00.000Z",
            }),
        ];
        const fetchMock = mockEventsFetch(events);
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.load(WorkspaceId);

        expect(fetchMock).toHaveBeenCalledWith(EventsUrl);
        expect(globalStore.get(model.feedAtom)).toEqual([
            {
                fromWorkspaceId: "ws-a",
                toWorkspaceId: WorkspaceId,
                milestone: "first_diff",
                note: "[sibling_context_delivered] progress from claude (ws-a)",
                at: "2026-08-11T10:01:00.000Z",
            },
            {
                fromWorkspaceId: "ws-a",
                toWorkspaceId: WorkspaceId,
                milestone: "finished",
                note: "[sibling_context_delivered] from claude (ws-a)",
                at: "2026-08-11T10:02:00.000Z",
            },
        ]);
        expect(globalStore.get(model.noticeAtom)).toBe("");
        expect(globalStore.get(model.errorAtom)).toBe("");
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("shows the empty-feed notice and no rows when no sibling events are present", async () => {
        const events = [{ type: "completed", taskId: "t", createdAt: "2026-08-11T10:00:00.000Z" }];
        vi.stubGlobal("fetch", mockEventsFetch(events));

        const model = makeModel();
        await model.load(WorkspaceId);

        expect(globalStore.get(model.feedAtom)).toEqual([]);
        expect(globalStore.get(model.noticeAtom)).toBe("No sibling cross-pollination yet");
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("degrades truthfully with the backend reason on a non-2xx response", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                json: async () => ({ error: { message: "workspace access denied" } }),
            })
        );

        const model = makeModel();
        await model.load(WorkspaceId);

        expect(globalStore.get(model.feedAtom)).toEqual([]);
        expect(globalStore.get(model.errorAtom)).toBe("workspace access denied");
        expect(globalStore.get(model.noticeAtom)).toBe("");
        expect(globalStore.get(model.connectedAtom)).toBe(false);
    });

    it("degrades to 'Not connected.' and clears the feed on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        globalStore.set(model.feedAtom, [
            {
                fromWorkspaceId: "x",
                toWorkspaceId: "y",
                milestone: "finished",
                note: "stale",
                at: "2026-01-01T00:00:00.000Z",
            },
        ]);
        await model.load(WorkspaceId);

        expect(globalStore.get(model.errorAtom)).toBe("Not connected.");
        expect(globalStore.get(model.feedAtom)).toEqual([]);
        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });
});
