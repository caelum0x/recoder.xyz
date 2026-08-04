// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-diff", () => ({
    RecoderDiffView: () => null,
}));

import { afterEach, describe, expect, it, vi } from "vitest";
import { globalStore } from "@/app/store/global";
import { atom } from "jotai";
import { RecoderDiffViewModel } from "./recoder-diff-model";

const BaseUrl = "http://127.0.0.1:3100/api/conductor/workspaces";

function makeModel(): RecoderDiffViewModel {
    const initOpts = {
        blockId: "b1",
        waveEnv: { wos: { getWaveObjectAtom: () => atom(null) } },
    } as unknown as ViewModelInitType;
    return new RecoderDiffViewModel(initOpts);
}

function jsonResponse(ok: boolean, status: number, body: unknown) {
    return Promise.resolve({ ok, status, json: async () => body });
}

const EmptyDiffData = {
    workspaceId: "ws-1",
    baseRef: "main",
    branch: "feat/x",
    stat: "",
    patch: "",
    untracked: [],
    changedFiles: 0,
};

const Ws = { workspaceId: "ws-1", branch: "feat/x", state: "awaiting_review", runtimeId: "claude-code" };

// A flexible router: the /pr POST and the /pr-status read are configurable; the
// refresh() fan-out (workspaces list, diff, checks, preview, approval) lands on
// benign responses so a create's post-success refresh has real edges to hit.
function routeFetch(opts: { pr?: Promise<unknown>; prStatus?: Promise<unknown> } = {}) {
    return vi.fn().mockImplementation((url: string) => {
        const u = String(url);
        if (u.endsWith("/pr")) {
            return opts.pr ?? jsonResponse(true, 200, { success: true, data: { url: "https://x/pull/1" } });
        }
        if (u.endsWith("/pr-status")) {
            return (
                opts.prStatus ??
                jsonResponse(true, 200, {
                    data: { available: true, hasPr: false, reason: "no pull request for branch" },
                })
            );
        }
        if (u.endsWith("/api/conductor/workspaces")) {
            return jsonResponse(true, 200, { success: true, data: { workspaces: [Ws] } });
        }
        if (u.endsWith("/diff")) {
            return jsonResponse(true, 200, { success: true, data: EmptyDiffData });
        }
        if (u.endsWith("/checks")) {
            return jsonResponse(true, 200, { data: { available: false, reason: "no pull request" } });
        }
        return jsonResponse(true, 200, { success: true, data: null });
    });
}

describe("RecoderDiffViewModel.createPr", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("POSTs the {title} shape the PR route validates, derived from the branch", async () => {
        const fetchMock = routeFetch();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.workspacesAtom, [Ws]);
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.createPr();

        expect(fetchMock).toHaveBeenCalledWith(`${BaseUrl}/ws-1/pr`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "feat/x" }),
        });
        expect(globalStore.get(model.prStatusAtom)).toBe("PR created: https://x/pull/1");
    });

    it("on success re-probes gh so the new PR's live chip lands in the view", async () => {
        const fetchMock = routeFetch({
            prStatus: jsonResponse(true, 200, {
                data: { available: true, hasPr: true, number: 42, state: "open", url: "https://x/pull/42" },
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.workspacesAtom, [Ws]);
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.createPr();

        const view = globalStore.get(model.prViewAtom);
        expect(view.hasPr).toBe(true);
        expect(view.chip).toEqual({ number: 42, state: "open", url: "https://x/pull/42", checks: "none" });
    });

    it("surfaces the governance verdict's reason on a 403 (never a fabricated PR)", async () => {
        const fetchMock = routeFetch({
            pr: jsonResponse(false, 403, {
                success: false,
                error: { message: "blocked by governance gate: workspace.pr requires approval" },
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.workspacesAtom, [Ws]);
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.createPr();

        expect(globalStore.get(model.prStatusAtom)).toBe(
            "blocked by governance gate: workspace.pr requires approval",
        );
        expect(globalStore.get(model.prViewAtom)).toBeNull();
    });

    it("surfaces a 503 allowed-but-failed with the backend's real reason (no remote / push failed)", async () => {
        const fetchMock = routeFetch({
            pr: jsonResponse(false, 503, {
                success: false,
                error: { message: "git push failed: no configured remote" },
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.workspacesAtom, [Ws]);
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.createPr();

        expect(globalStore.get(model.prStatusAtom)).toBe(
            "PR could not complete — git push failed: no configured remote.",
        );
    });

    it("reports an unreachable backend truthfully and clears the busy flag", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        globalStore.set(model.workspacesAtom, [Ws]);
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.createPr();

        expect(globalStore.get(model.prStatusAtom)).toBe("PR unavailable — Recoder isn’t reachable.");
        expect(globalStore.get(model.prCreatingAtom)).toBe(false);
    });

    it("is a no-op with no selection", async () => {
        const fetchMock = routeFetch();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "");
        await model.createPr();

        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("RecoderDiffViewModel.fetchPrStatus", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("stores an existing PR's view (chip present) so the header shows it", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    data: { available: true, hasPr: true, number: 7, state: "open", url: "https://x/pull/7" },
                }),
            }),
        );

        const model = makeModel();
        await model.fetchPrStatus("ws-1");

        const view = globalStore.get(model.prViewAtom);
        expect(view.chip).toEqual({ number: 7, state: "open", url: "https://x/pull/7", checks: "none" });
        expect(model.prViewWorkspaceId).toBe("ws-1");
    });

    it("stores a truthful unavailable view (no pushable remote) that disables Create PR", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ data: { available: false, hasPr: false, reason: "gh CLI not found" } }),
            }),
        );

        const model = makeModel();
        await model.fetchPrStatus("ws-1");

        expect(globalStore.get(model.prViewAtom)).toEqual({
            available: false,
            hasPr: false,
            reason: "gh CLI not found",
            chip: null,
        });
        expect(model.prViewWorkspaceId).toBe("ws-1");
    });

    it("drops the latch on an unreachable read so a later refresh retries", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("refused")));

        const model = makeModel();
        model.prProbedAtMs = 123;
        await model.fetchPrStatus("ws-1");

        expect(globalStore.get(model.prViewAtom)).toBeNull();
        expect(model.prViewWorkspaceId).toBe("");
    });
});
