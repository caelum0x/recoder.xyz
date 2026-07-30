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
import {
    checksArePending,
    isFailedConclusion,
    parseChecksData,
    RecoderDiffViewModel,
    suggestReviewAction,
} from "./recoder-diff-model";

const BaseUrl = "http://127.0.0.1:3100/api/conductor/workspaces";

function makeModel(): RecoderDiffViewModel {
    const initOpts = {
        blockId: "b1",
        waveEnv: { wos: { getWaveObjectAtom: () => atom(null) } },
    } as unknown as ViewModelInitType;
    return new RecoderDiffViewModel(initOpts);
}

function okJson(data: unknown) {
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });
}

describe("parseChecksData", () => {
    it("degrades a non-object payload to a truthful unavailable", () => {
        expect(parseChecksData(null)).toEqual({ available: false, reason: "checks unavailable" });
        expect(parseChecksData("nope")).toEqual({ available: false, reason: "checks unavailable" });
        expect(parseChecksData([1, 2])).toEqual({ available: false, reason: "checks unavailable" });
    });

    it("keeps the backend's truthful reason when unavailable", () => {
        const parsed = parseChecksData({ available: false, reason: "no pull request for the current branch" });
        expect(parsed).toEqual({ available: false, reason: "no pull request for the current branch" });
    });

    it("substitutes a fallback reason when the backend omits one", () => {
        expect(parseChecksData({ available: false })).toEqual({ available: false, reason: "checks unavailable" });
        expect(parseChecksData({ available: false, reason: "  " })).toEqual({
            available: false,
            reason: "checks unavailable",
        });
    });

    it("never treats a truthy-but-not-true available as available", () => {
        expect(parseChecksData({ available: "yes" }).available).toBe(false);
        expect(parseChecksData({ available: 1 }).available).toBe(false);
    });

    it("parses the full available shape", () => {
        const parsed = parseChecksData({
            available: true,
            mergeable: "MERGEABLE",
            reviewDecision: "APPROVED",
            checks: [
                { name: "ci/build", status: "COMPLETED", conclusion: "SUCCESS" },
                { name: "ci/test", status: "IN_PROGRESS", conclusion: "" },
            ],
        });
        expect(parsed).toEqual({
            available: true,
            mergeable: "MERGEABLE",
            reviewDecision: "APPROVED",
            checks: [
                { name: "ci/build", status: "COMPLETED", conclusion: "SUCCESS" },
                { name: "ci/test", status: "IN_PROGRESS", conclusion: "" },
            ],
        });
    });

    it("drops malformed check rows and coerces missing fields to empty strings", () => {
        const parsed = parseChecksData({
            available: true,
            checks: [null, "junk", { status: "COMPLETED" }, { name: "" }, { name: "lint" }],
        });
        expect(parsed.checks).toEqual([{ name: "lint", status: "", conclusion: "" }]);
    });

    it("coerces non-string mergeable/reviewDecision and a missing checks array", () => {
        const parsed = parseChecksData({ available: true, mergeable: 7, reviewDecision: null });
        expect(parsed).toEqual({ available: true, mergeable: "", reviewDecision: "", checks: [] });
    });
});

describe("isFailedConclusion", () => {
    it("treats gh failure-family conclusions as failed, case-insensitively", () => {
        for (const c of ["failure", "ERROR", "timed_out", "startup_failure", "action_required", "cancelled"]) {
            expect(isFailedConclusion(c)).toBe(true);
        }
    });
    it("treats success / neutral / empty as not failed", () => {
        for (const c of ["success", "SUCCESS", "neutral", "skipped", ""]) {
            expect(isFailedConclusion(c)).toBe(false);
        }
    });
});

describe("suggestReviewAction", () => {
    it("suggests creating a PR when none exists yet", () => {
        expect(
            suggestReviewAction({ available: false, reason: "no pull request for the current branch" })
        ).toEqual({ action: "create-pr", label: "No PR yet — create one to run checks and enable merge" });
    });

    it("suggests nothing for a benign unavailability (e.g. gh missing) or null", () => {
        expect(suggestReviewAction(null)).toBe(null);
        expect(suggestReviewAction({ available: false, reason: "gh CLI not found" })).toBe(null);
    });

    it("prioritizes merge conflicts over everything else", () => {
        expect(
            suggestReviewAction({
                available: true,
                mergeable: "CONFLICTING",
                reviewDecision: "APPROVED",
                checks: [{ name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }],
            })?.action
        ).toBe("resolve-conflicts");
    });

    it("surfaces requested changes and failing checks as address-feedback", () => {
        expect(
            suggestReviewAction({
                available: true,
                mergeable: "MERGEABLE",
                reviewDecision: "CHANGES_REQUESTED",
                checks: [{ name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }],
            })?.action
        ).toBe("address-feedback");
        expect(
            suggestReviewAction({
                available: true,
                mergeable: "MERGEABLE",
                reviewDecision: "",
                checks: [{ name: "ci", status: "COMPLETED", conclusion: "FAILURE" }],
            })?.action
        ).toBe("address-feedback");
    });

    it("waits while checks run or mergeability is still unknown", () => {
        expect(
            suggestReviewAction({
                available: true,
                mergeable: "MERGEABLE",
                reviewDecision: "",
                checks: [{ name: "ci", status: "IN_PROGRESS", conclusion: "" }],
            })?.action
        ).toBe("wait");
        expect(
            suggestReviewAction({
                available: true,
                mergeable: "UNKNOWN",
                reviewDecision: "",
                checks: [{ name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }],
            })?.action
        ).toBe("wait");
    });

    it("waits on a required review even when checks are green", () => {
        expect(
            suggestReviewAction({
                available: true,
                mergeable: "MERGEABLE",
                reviewDecision: "REVIEW_REQUIRED",
                checks: [{ name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }],
            })?.action
        ).toBe("wait");
    });

    it("suggests merge only when mergeable, reviewed/ungated, and checks pass", () => {
        expect(
            suggestReviewAction({
                available: true,
                mergeable: "MERGEABLE",
                reviewDecision: "APPROVED",
                checks: [{ name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }],
            })?.action
        ).toBe("merge");
        expect(
            suggestReviewAction({
                available: true,
                mergeable: "MERGEABLE",
                reviewDecision: "",
                checks: [],
            })?.action
        ).toBe("merge");
    });
});

describe("checksArePending", () => {
    it("is false for null / unavailable / settled checks", () => {
        expect(checksArePending(null)).toBe(false);
        expect(checksArePending({ available: false, reason: "no pr" })).toBe(false);
        expect(
            checksArePending({
                available: true,
                mergeable: "MERGEABLE",
                reviewDecision: "APPROVED",
                checks: [{ name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }],
            })
        ).toBe(false);
    });

    it("is false when available with no checks and a known mergeability", () => {
        expect(checksArePending({ available: true, mergeable: "MERGEABLE", reviewDecision: "", checks: [] })).toBe(
            false
        );
    });

    it("is true while a check row is still running", () => {
        expect(
            checksArePending({
                available: true,
                mergeable: "MERGEABLE",
                reviewDecision: "",
                checks: [{ name: "ci", status: "IN_PROGRESS", conclusion: "" }],
            })
        ).toBe(true);
    });

    it("is true while GitHub is still computing mergeability", () => {
        expect(
            checksArePending({
                available: true,
                mergeable: "UNKNOWN",
                reviewDecision: "",
                checks: [{ name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }],
            })
        ).toBe(true);
    });
});

describe("RecoderDiffViewModel.refreshChecks", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("force-re-probes checks for the current selection", async () => {
        const fetchMock = vi
            .fn()
            .mockImplementation(() => okJson({ available: true, mergeable: "MERGEABLE", reviewDecision: "", checks: [] }));
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.refreshChecks();

        expect(fetchMock).toHaveBeenCalledWith(`${BaseUrl}/ws-1/checks`);
        expect(model.checksWorkspaceId).toBe("ws-1");
    });

    it("is a no-op with no selection (never shells out to gh)", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "");
        await model.refreshChecks();

        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("RecoderDiffViewModel.refresh checks re-poll", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function routeFetch(checksData: unknown) {
        return vi.fn().mockImplementation((url: string) => {
            if (url.endsWith("/checks")) {
                return okJson(checksData);
            }
            if (url.endsWith("/diff")) {
                return okJson({
                    workspaceId: "ws-1",
                    baseRef: "main",
                    branch: "b",
                    stat: "",
                    patch: "",
                    untracked: [],
                    changedFiles: 0,
                });
            }
            return okJson({ workspaces: [{ workspaceId: "ws-1", branch: "b", state: "running", runtimeId: "r" }] });
        });
    }

    function countChecks(fetchMock: ReturnType<typeof vi.fn>): number {
        return fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/checks")).length;
    }

    it("re-probes pending checks only after the interval, never on every tick", async () => {
        const fetchMock = routeFetch({
            available: true,
            mergeable: "MERGEABLE",
            reviewDecision: "",
            checks: [{ name: "ci", status: "IN_PROGRESS", conclusion: "" }],
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();
        expect(countChecks(fetchMock)).toBe(1);

        // Just probed → the next 6s tick must NOT shell out to gh again.
        model.checksProbedAtMs = Date.now();
        await model.refresh();
        expect(countChecks(fetchMock)).toBe(1);

        // Interval elapsed and still pending → one re-probe.
        model.checksProbedAtMs = 0;
        await model.refresh();
        expect(countChecks(fetchMock)).toBe(2);
    });

    it("stops re-probing once checks have settled, even after the interval", async () => {
        const fetchMock = routeFetch({
            available: true,
            mergeable: "MERGEABLE",
            reviewDecision: "APPROVED",
            checks: [{ name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }],
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();
        expect(countChecks(fetchMock)).toBe(1);

        model.checksProbedAtMs = 0;
        await model.refresh();
        expect(countChecks(fetchMock)).toBe(1);
    });
});

describe("RecoderDiffViewModel.fetchChecks", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("loads checks from the workspace checks edge", async () => {
        const data = {
            available: true,
            mergeable: "MERGEABLE",
            reviewDecision: "REVIEW_REQUIRED",
            checks: [{ name: "ci", status: "COMPLETED", conclusion: "FAILURE" }],
        };
        const fetchMock = vi.fn().mockImplementation(() => okJson(data));
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.fetchChecks("ws-1");

        expect(fetchMock).toHaveBeenCalledWith(`${BaseUrl}/ws-1/checks`);
        expect(globalStore.get(model.checksAtom)).toEqual(data);
        expect(globalStore.get(model.checksLoadingAtom)).toBe(false);
        expect(model.checksWorkspaceId).toBe("ws-1");
    });

    it("surfaces the backend's unavailable reason quietly (not an error)", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(() => okJson({ available: false, reason: "gh CLI not found" }))
        );

        const model = makeModel();
        await model.fetchChecks("ws-1");

        expect(globalStore.get(model.checksAtom)).toEqual({ available: false, reason: "gh CLI not found" });
    });

    it("treats a 404 as an older backend without the checks edge", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));

        const model = makeModel();
        await model.fetchChecks("ws-1");

        expect(globalStore.get(model.checksAtom)).toEqual({
            available: false,
            reason: "checks endpoint not available",
        });
    });

    it("prefers the backend error message on non-2xx", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
                json: async () => ({ success: false, error: { message: "conductor not ready" } }),
            })
        );

        const model = makeModel();
        await model.fetchChecks("ws-1");

        expect(globalStore.get(model.checksAtom)).toEqual({ available: false, reason: "conductor not ready" });
    });

    it("falls back to a status-coded reason when the error body is empty", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));

        const model = makeModel();
        await model.fetchChecks("ws-1");

        expect(globalStore.get(model.checksAtom)).toEqual({ available: false, reason: "checks unavailable (500)" });
    });

    it("degrades to unavailable on transport failure without throwing", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        await model.fetchChecks("ws-1");

        expect(globalStore.get(model.checksAtom)).toEqual({
            available: false,
            reason: "checks endpoint not available",
        });
        expect(globalStore.get(model.checksLoadingAtom)).toBe(false);
    });
});

describe("RecoderDiffViewModel workspace switching", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("selectWorkspace fetches checks alongside the diff", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            if (url.endsWith("/checks")) {
                return okJson({ available: false, reason: "no pull request for the current branch" });
            }
            return okJson({ workspaceId: "ws-2", baseRef: "main", branch: "b", stat: "", patch: "", untracked: [], changedFiles: 0 });
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.selectWorkspace("ws-2");

        expect(fetchMock).toHaveBeenCalledWith(`${BaseUrl}/ws-2/checks`);
        expect(globalStore.get(model.checksAtom)).toEqual({
            available: false,
            reason: "no pull request for the current branch",
        });
        expect(model.checksWorkspaceId).toBe("ws-2");
    });

    it("clearing the selection clears the checks state", async () => {
        vi.stubGlobal("fetch", vi.fn());

        const model = makeModel();
        globalStore.set(model.checksAtom, { available: true, mergeable: "", reviewDecision: "", checks: [] });
        model.checksWorkspaceId = "ws-1";
        await model.selectWorkspace("");

        expect(globalStore.get(model.checksAtom)).toBe(null);
        expect(model.checksWorkspaceId).toBe("");
    });

    it("discards a stale checks response when a newer fetch superseded it", async () => {
        let resolveSlow: (v: unknown) => void;
        const slow = new Promise((r) => {
            resolveSlow = r;
        });
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(() => slow)
            .mockImplementationOnce(() =>
                okJson({ available: true, mergeable: "MERGEABLE", reviewDecision: "", checks: [] })
            );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        const first = model.fetchChecks("ws-A");
        await model.fetchChecks("ws-B");
        resolveSlow!({
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: { available: true, mergeable: "CONFLICTING", reviewDecision: "", checks: [] } }),
        });
        await first;

        expect(globalStore.get(model.checksAtom)).toEqual({
            available: true,
            mergeable: "MERGEABLE",
            reviewDecision: "",
            checks: [],
        });
        expect(model.checksWorkspaceId).toBe("ws-B");
    });

    it("clears stale checks at fetch start so the strip never shows the previous workspace", async () => {
        let resolveSlow: (v: unknown) => void;
        const slow = new Promise((r) => {
            resolveSlow = r;
        });
        vi.stubGlobal("fetch", vi.fn().mockImplementation(() => slow));

        const model = makeModel();
        globalStore.set(model.checksAtom, { available: true, mergeable: "MERGEABLE", reviewDecision: "", checks: [] });
        const pending = model.fetchChecks("ws-next");

        expect(globalStore.get(model.checksAtom)).toBe(null);
        resolveSlow!({ ok: true, status: 200, json: async () => ({ success: true, data: { available: false, reason: "x" } }) });
        await pending;
    });

    it("drops the poll-skip latch on transient failure so the next refresh retries", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: { message: "boom" } }) })
        );

        const model = makeModel();
        await model.fetchChecks("ws-err");

        expect(globalStore.get(model.checksAtom)).toEqual({ available: false, reason: "boom" });
        expect(model.checksWorkspaceId).toBe("");
    });

    it("keeps the 404 latch (older backend) so the poll does not re-probe every tick", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));

        const model = makeModel();
        await model.fetchChecks("ws-old");

        expect(globalStore.get(model.checksAtom)).toEqual({ available: false, reason: "checks endpoint not available" });
        expect(model.checksWorkspaceId).toBe("ws-old");
    });
});

describe("RecoderDiffViewModel review comments", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("addComment enqueues a trimmed comment and ignores empty bodies", () => {
        const model = makeModel();
        model.addComment("src/a.ts", 12, "  fix this  ");
        model.addComment("src/a.ts", 13, "   ");
        model.addComment("", 1, "no file");
        expect(globalStore.get(model.pendingCommentsAtom)).toEqual([{ file: "src/a.ts", line: 12, body: "fix this" }]);
    });

    it("removeComment drops the comment at an index (bounds-safe)", () => {
        const model = makeModel();
        model.addComment("a.ts", 1, "one");
        model.addComment("b.ts", null, "two");
        model.removeComment(5);
        model.removeComment(0);
        expect(globalStore.get(model.pendingCommentsAtom)).toEqual([{ file: "b.ts", line: null, body: "two" }]);
    });

    it("sendComments POSTs the queue, clears it, and reports success", async () => {
        const fetchMock = vi.fn().mockImplementation(() => okJson({ steered: null }));
        vi.stubGlobal("fetch", fetchMock);
        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");
        model.addComment("src/a.ts", 12, "extract helper");
        await model.sendComments();

        expect(fetchMock).toHaveBeenCalledWith(
            `${BaseUrl}/ws-1/review-comments`,
            expect.objectContaining({ method: "POST" })
        );
        const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
        expect(sentBody).toEqual({ comments: [{ file: "src/a.ts", line: 12, body: "extract helper" }] });
        expect(globalStore.get(model.pendingCommentsAtom)).toEqual([]);
        expect(globalStore.get(model.commentStatusAtom)).toBe("Sent 1 comment to the agent.");
    });

    it("sendComments is a no-op with an empty queue or no selection", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");
        await model.sendComments();
        model.addComment("a.ts", 1, "x");
        globalStore.set(model.selectedIdAtom, "");
        await model.sendComments();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sendComments keeps the queue and surfaces the reason on a governance deny", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                json: async () => ({ success: false, error: { message: "needs approval" } }),
            })
        );
        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");
        model.addComment("a.ts", 1, "x");
        await model.sendComments();
        expect(globalStore.get(model.commentStatusAtom)).toBe("needs approval");
        expect(globalStore.get(model.pendingCommentsAtom)).toHaveLength(1);
    });
});
