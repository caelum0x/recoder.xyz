// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-agents", () => ({
    RecoderAgentsView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderAgentsViewModel } from "./recoder-agents-model";

const AgentsUrl = "http://127.0.0.1:3100/api/interop/agents";

function makeModel(): RecoderAgentsViewModel {
    return new RecoderAgentsViewModel({ blockId: "b1" } as ViewModelInitType);
}

// Wrap a bare `{ agents }` payload in the sendSuccess envelope the edge returns.
function okAgents(agents: unknown) {
    return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { agents } }),
    });
}

describe("RecoderAgentsViewModel.refresh", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("projects the roster + capabilities and maps heartbeat status to truthful liveness", async () => {
        const wire = [
            {
                id: "agent-z",
                kind: "remote_a2a",
                card: { id: "agent-z", name: "Zeta", capabilities: ["plan", "review"] },
                status: "degraded",
            },
            {
                id: "agent-a",
                kind: "runtime",
                card: { id: "agent-a", name: "Alpha", capabilities: ["code"] },
                status: "up",
            },
            {
                id: "agent-m",
                kind: "connector",
                card: { id: "agent-m", name: "Mu", capabilities: [] },
                status: "down",
            },
        ];
        const fetchMock = okAgents(wire);
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();

        expect(fetchMock).toHaveBeenCalledWith(AgentsUrl);
        expect(globalStore.get(model.agentsAtom)).toEqual([
            { id: "agent-a", name: "Alpha", capabilities: ["code"], liveness: "online" },
            { id: "agent-m", name: "Mu", capabilities: [], liveness: "offline" },
            { id: "agent-z", name: "Zeta", capabilities: ["plan", "review"], liveness: "stale" },
        ]);
        expect(globalStore.get(model.connectedAtom)).toBe(true);
        expect(globalStore.get(model.errorAtom)).toBe("");
        expect(globalStore.get(model.noticeAtom)).toBe("");
    });

    it("never fabricates an online status: an unknown/missing heartbeat status projects to 'unknown'", async () => {
        const wire = [
            { id: "a1", card: { name: "One", capabilities: ["x"] }, status: "unknown" },
            { id: "a2", card: { name: "Two", capabilities: [] } },
        ];
        vi.stubGlobal("fetch", okAgents(wire));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.agentsAtom)).toEqual([
            { id: "a1", name: "One", capabilities: ["x"], liveness: "unknown" },
            { id: "a2", name: "Two", capabilities: [], liveness: "unknown" },
        ]);
    });

    it("falls the name back to the id and drops an idless (fabricated) row + non-string capabilities", async () => {
        const wire = [
            { id: "keeps-id", card: { name: "", capabilities: ["ok", 7, "", "cap2"] }, status: "up" },
            { id: "", card: { name: "No Id", capabilities: ["nope"] }, status: "up" },
            { card: { name: "Missing Id", capabilities: ["nope"] }, status: "up" },
        ];
        vi.stubGlobal("fetch", okAgents(wire));

        const model = makeModel();
        await model.refresh();

        const agents = globalStore.get(model.agentsAtom);
        expect(agents).toHaveLength(1);
        expect(agents[0]).toEqual({ id: "keeps-id", name: "keeps-id", capabilities: ["ok", "cap2"], liveness: "online" });
    });

    it("shows a truthful 'No agents registered' notice and no rows when the roster is empty", async () => {
        vi.stubGlobal("fetch", okAgents([]));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.agentsAtom)).toEqual([]);
        expect(globalStore.get(model.noticeAtom)).toBe("No agents registered");
        expect(globalStore.get(model.connectedAtom)).toBe(true);
        expect(globalStore.get(model.errorAtom)).toBe("");
    });

    it("degrades to the backend reason (no fabricated rows) on a non-2xx", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                json: async () => ({ error: { message: "unauthorized" } }),
            })
        );

        const model = makeModel();
        globalStore.set(model.agentsAtom, [{ id: "stale", name: "stale", capabilities: [], liveness: "online" }]);
        await model.refresh();

        expect(globalStore.get(model.agentsAtom)).toEqual([]);
        expect(globalStore.get(model.errorAtom)).toBe("unauthorized");
        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.noticeAtom)).toBe("");
    });

    it("degrades to 'Not connected.' on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.errorAtom)).toBe("Not connected.");
        expect(globalStore.get(model.agentsAtom)).toEqual([]);
        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });
});
