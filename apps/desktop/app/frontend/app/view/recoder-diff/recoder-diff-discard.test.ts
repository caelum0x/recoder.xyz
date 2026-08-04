// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-diff", () => ({
    RecoderDiffView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { atom } from "jotai";
import { computeDiffHunkAnchors } from "./recoder-diff-files";
import { RecoderDiffViewModel, summarizeDiscardOutcome } from "./recoder-diff-model";

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
    branch: "b",
    stat: "",
    patch: "",
    untracked: [],
    changedFiles: 0,
};

// Routes /diff to a benign empty diff and everything else to `discardResponse`,
// so the refresh-after-discard call has a real edge to land on.
function routeFetch(discardResponse: Promise<unknown>) {
    return vi.fn().mockImplementation((url: string) => {
        if (String(url).endsWith("/diff")) {
            return jsonResponse(true, 200, { success: true, data: EmptyDiffData });
        }
        return discardResponse;
    });
}

const TwoFilePatch = [
    "diff --git a/src/a.ts b/src/a.ts",
    "index 111..222 100644",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,2 @@",
    "-old",
    "+new",
    "@@ -10,2 +10,2 @@",
    "-o2",
    "+n2",
    "diff --git a/b.txt b/b.txt",
    "--- a/b.txt",
    "+++ b/b.txt",
    "@@ -1 +1 @@",
    "-x",
    "+y",
].join("\n");

describe("computeDiffHunkAnchors", () => {
    it("anchors every @@ line to its file path and per-file hunk ordinal", () => {
        const anchors = computeDiffHunkAnchors(TwoFilePatch);
        expect(anchors).toEqual({
            4: { path: "src/a.ts", hunkIndex: 0 },
            7: { path: "src/a.ts", hunkIndex: 1 },
            13: { path: "b.txt", hunkIndex: 0 },
        });
    });

    it("restarts the ordinal at 0 for each file (the backend re-diffs one path at a time)", () => {
        const anchors = computeDiffHunkAnchors(TwoFilePatch);
        expect(anchors[13].hunkIndex).toBe(0);
    });

    it("yields no anchor for a pathless section (nothing safe to POST)", () => {
        const anchors = computeDiffHunkAnchors("@@ -1 +1 @@\n-x\n+y");
        expect(anchors).toEqual({});
    });

    it("yields nothing for an empty patch", () => {
        expect(computeDiffHunkAnchors("")).toEqual({});
    });
});

describe("summarizeDiscardOutcome", () => {
    it("summarizes a clean file-level discard", () => {
        const data = {
            discard: {
                workspaceId: "ws-1",
                base: "main",
                committed: true,
                results: [
                    { path: "src/a.ts", action: "restored" },
                    { path: "b.txt", action: "removed" },
                ],
            },
        };
        expect(summarizeDiscardOutcome(data)).toBe("Discarded 2 files.");
    });

    it("summarizes a clean hunk-level discard", () => {
        const data = {
            discard: {
                workspaceId: "ws-1",
                base: "main",
                path: "src/a.ts",
                committed: true,
                hunks: [{ index: 1, action: "discarded" }],
            },
        };
        expect(summarizeDiscardOutcome(data)).toBe("Discarded 1 hunk.");
    });

    it("reports a zero-effect discard truthfully instead of claiming success", () => {
        const data = {
            discard: { committed: false, results: [{ path: "src/a.ts", action: "unchanged" }] },
        };
        expect(summarizeDiscardOutcome(data)).toBe("Nothing to discard — already matches the review base.");
    });

    it("surfaces per-item failures with their real reasons", () => {
        const data = {
            discard: {
                committed: false,
                hunks: [{ index: 7, action: "failed", reason: "hunk index out of range (2 hunk(s) in diff)" }],
            },
        };
        expect(summarizeDiscardOutcome(data)).toBe(
            "Could not discard hunk 8 — hunk index out of range (2 hunk(s) in diff)."
        );
    });

    it("reports a mixed outcome (some discarded, some failed) truthfully", () => {
        const data = {
            discard: {
                committed: true,
                results: [
                    { path: "src/a.ts", action: "restored" },
                    { path: "b.txt", action: "failed", reason: "restore failed" },
                ],
            },
        };
        expect(summarizeDiscardOutcome(data)).toBe("Discarded 1 file; could not discard b.txt — restore failed.");
    });

    it("degrades an unparseable success payload to a bare confirmation", () => {
        expect(summarizeDiscardOutcome(null)).toBe("Discarded.");
        expect(summarizeDiscardOutcome({})).toBe("Discarded.");
        expect(summarizeDiscardOutcome({ discard: "yes" })).toBe("Discarded.");
    });
});

describe("RecoderDiffViewModel.discardFiles", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("POSTs the exact {paths} shape the discard route validates", async () => {
        const fetchMock = routeFetch(
            jsonResponse(true, 200, {
                success: true,
                data: { discard: { committed: true, results: [{ path: "src/a.ts", action: "restored" }] } },
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.discardFiles(["src/a.ts"]);

        expect(fetchMock).toHaveBeenCalledWith(`${BaseUrl}/ws-1/files/discard`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths: ["src/a.ts"] }),
        });
        expect(globalStore.get(model.discardStatusAtom)).toBe("Discarded 1 file.");
    });

    it("reloads the diff after a successful discard (worktree truth, no client staging)", async () => {
        const fetchMock = routeFetch(
            jsonResponse(true, 200, {
                success: true,
                data: { discard: { committed: true, results: [{ path: "src/a.ts", action: "restored" }] } },
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.discardFiles(["src/a.ts"]);

        const diffCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/diff"));
        expect(diffCalls).toHaveLength(1);
        expect(globalStore.get(model.diffAtom)).toEqual(EmptyDiffData);
    });

    it("renders the governance verdict's reason on a 403 deny, not a generic error", async () => {
        const fetchMock = routeFetch(
            jsonResponse(false, 403, {
                success: false,
                error: { message: "blocked by governance gate: workspace.discard requires approval" },
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.discardFiles(["src/a.ts"]);

        expect(globalStore.get(model.discardStatusAtom)).toBe(
            "blocked by governance gate: workspace.discard requires approval"
        );
        const diffCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/diff"));
        expect(diffCalls).toHaveLength(0);
    });

    it("falls back to a truthful deny message when the 403 body carries no reason", async () => {
        const fetchMock = routeFetch(jsonResponse(false, 403, {}));
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.discardFiles(["src/a.ts"]);

        expect(globalStore.get(model.discardStatusAtom)).toBe("Discard blocked — needs approval.");
    });

    it("surfaces a 503 allowed-but-failed with the backend's reason", async () => {
        const fetchMock = routeFetch(
            jsonResponse(false, 503, { success: false, error: { message: "git checkout failed" } })
        );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.discardFiles(["src/a.ts"]);

        expect(globalStore.get(model.discardStatusAtom)).toBe("Discard could not complete — git checkout failed.");
    });

    it("reports an unreachable backend truthfully and clears the busy flag", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.discardFiles(["src/a.ts"]);

        expect(globalStore.get(model.discardStatusAtom)).toBe("Discard unavailable — Recoder isn’t reachable.");
        expect(globalStore.get(model.discardingAtom)).toBe(false);
    });

    it("is a no-op with no selection or no/blank paths", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "");
        await model.discardFiles(["src/a.ts"]);

        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.discardFiles([]);
        await model.discardFiles(["  "]);

        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("RecoderDiffViewModel.discardHunks", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("POSTs the exact {path, hunkIndexes} shape the discard-hunks route validates", async () => {
        const fetchMock = routeFetch(
            jsonResponse(true, 200, {
                success: true,
                data: {
                    discard: { committed: true, path: "src/a.ts", hunks: [{ index: 1, action: "discarded" }] },
                },
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.discardHunks("src/a.ts", [1]);

        expect(fetchMock).toHaveBeenCalledWith(`${BaseUrl}/ws-1/files/discard-hunks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: "src/a.ts", hunkIndexes: [1] }),
        });
        expect(globalStore.get(model.discardStatusAtom)).toBe("Discarded 1 hunk.");
        const diffCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/diff"));
        expect(diffCalls).toHaveLength(1);
    });

    it("renders the governance verdict's reason on a 403 deny", async () => {
        const fetchMock = routeFetch(
            jsonResponse(false, 403, { success: false, error: { message: "blocked by governance gate" } })
        );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.discardHunks("src/a.ts", [0]);

        expect(globalStore.get(model.discardStatusAtom)).toBe("blocked by governance gate");
    });

    it("surfaces the per-hunk failure a 200 can still carry (out-of-range index)", async () => {
        const fetchMock = routeFetch(
            jsonResponse(true, 200, {
                success: true,
                data: {
                    discard: {
                        committed: false,
                        path: "src/a.ts",
                        hunks: [{ index: 5, action: "failed", reason: "hunk index out of range (2 hunk(s) in diff)" }],
                    },
                },
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.discardHunks("src/a.ts", [5]);

        expect(globalStore.get(model.discardStatusAtom)).toBe(
            "Could not discard hunk 6 — hunk index out of range (2 hunk(s) in diff)."
        );
    });

    it("is a no-op with a blank path or no indexes", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.discardHunks("", [0]);
        await model.discardHunks("src/a.ts", []);

        expect(fetchMock).not.toHaveBeenCalled();
    });
});
