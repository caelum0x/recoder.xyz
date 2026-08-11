// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-capabilities", () => ({
    RecoderCapabilitiesView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderCapabilitiesViewModel } from "./recoder-capabilities-model";

const ServersUrl = "http://127.0.0.1:3100/api/mcp/servers";

function makeModel(): RecoderCapabilitiesViewModel {
    return new RecoderCapabilitiesViewModel({ blockId: "b1" } as ViewModelInitType);
}

// Wrap a registry payload in the /api/mcp/servers success envelope
// (sendSuccess(res, { count, servers })).
function mockServersFetch(servers: unknown) {
    const list = Array.isArray(servers) ? servers : [];
    return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { count: list.length, servers } }),
    });
}

describe("RecoderCapabilitiesViewModel.refresh", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("groups tools by server and carries kind/transport/enabled", async () => {
        const servers = [
            {
                serverId: "repo",
                kind: "repo",
                displayName: "Repository",
                transport: "http",
                enabled: true,
                toolNames: ["repo.search", "repo.diff"],
            },
            {
                serverId: "deploy",
                kind: "deploy",
                displayName: "Deployment",
                transport: "stdio",
                enabled: true,
                toolNames: ["deploy.status"],
            },
        ];
        const fetchMock = mockServersFetch(servers);
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();

        expect(fetchMock).toHaveBeenCalledWith(ServersUrl);
        const projected = globalStore.get(model.serversAtom);
        expect(projected).toHaveLength(2);
        expect(projected[0]).toMatchObject({
            serverId: "repo",
            displayName: "Repository",
            kind: "repo",
            transport: "http",
            enabled: true,
        });
        expect(projected[0].tools.map((t) => t.name)).toEqual(["repo.search", "repo.diff"]);
        expect(projected[1].tools.map((t) => t.name)).toEqual(["deploy.status"]);
        expect(globalStore.get(model.noticeAtom)).toBe("");
        expect(globalStore.get(model.errorAtom)).toBe("");
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("flags a deploy/secret tool high and a read tool low via the ported risk regex", async () => {
        const servers = [
            {
                serverId: "mix",
                kind: "custom",
                displayName: "Mixed",
                transport: "http",
                enabled: true,
                toolNames: ["deploy.production", "secret.read", "repo.search"],
            },
        ];
        vi.stubGlobal("fetch", mockServersFetch(servers));

        const model = makeModel();
        await model.refresh();

        const tools = globalStore.get(model.serversAtom)[0].tools;
        const byName = Object.fromEntries(tools.map((t) => [t.name, t.risk]));
        expect(byName["deploy.production"]).toBe("high");
        expect(byName["secret.read"]).toBe("high");
        expect(byName["repo.search"]).toBe("low");
    });

    it("renders a disabled server without dropping it", async () => {
        const servers = [
            {
                serverId: "preview",
                kind: "preview",
                displayName: "Preview",
                transport: "http",
                enabled: false,
                toolNames: ["preview.check"],
            },
        ];
        vi.stubGlobal("fetch", mockServersFetch(servers));

        const model = makeModel();
        await model.refresh();

        const projected = globalStore.get(model.serversAtom);
        expect(projected).toHaveLength(1);
        expect(projected[0].enabled).toBe(false);
        expect(projected[0].tools[0].risk).toBe("medium");
    });

    it("shows a truthful 'No tools registered' notice on an empty registry", async () => {
        vi.stubGlobal("fetch", mockServersFetch([]));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.serversAtom)).toEqual([]);
        expect(globalStore.get(model.noticeAtom)).toBe("No tools registered");
        expect(globalStore.get(model.errorAtom)).toBe("");
    });

    it("degrades to the error reason on a non-2xx without fabricating a server", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
                json: async () => ({ error: { message: "registry offline" } }),
            })
        );

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.serversAtom)).toEqual([]);
        expect(globalStore.get(model.noticeAtom)).toBe("registry offline");
        expect(globalStore.get(model.errorAtom)).toBe("");
    });

    it("degrades to 'Not connected.' on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.errorAtom)).toBe("Not connected.");
        expect(globalStore.get(model.serversAtom)).toEqual([]);
        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });
});
