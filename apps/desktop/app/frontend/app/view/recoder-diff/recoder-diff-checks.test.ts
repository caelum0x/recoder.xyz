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
    canSendBlockerFeedback,
    checksArePending,
    formatMergeSuccess,
    isFailedConclusion,
    parseChecksData,
    parseReadinessData,
    RecoderDiffViewModel,
    suggestEffectiveReviewAction,
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

describe("formatMergeSuccess", () => {
    it("keeps the default warn-mode trust advisory visible after delivery", () => {
        expect(
            formatMergeSuccess({
                trustWarning: "Low convergence trust. Review: 2 checks failing",
                trustTier: "low",
                trustScore: 27.4,
            })
        ).toBe("Merged. Trust advisory (low, 27/100): Low convergence trust. Review: 2 checks failing");
    });

    it("uses a calm success when no advisory was returned", () => {
        expect(formatMergeSuccess({ trustTier: "high", trustScore: 94 })).toBe("Merged.");
        expect(formatMergeSuccess(null)).toBe("Merged.");
    });
});

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

    it("retains Recoder-owned check provenance and GitHub partial availability", () => {
        expect(parseChecksData({
            available: true,
            githubAvailable: false,
            githubReason: "no pull request for the current branch",
            localRan: true,
            checks: [{
                name: "typecheck",
                status: "COMPLETED",
                conclusion: "FAILURE",
                source: "recoder",
                detail: "src/a.ts:1 TS2304",
                autofix: { prompt: "Fix the typecheck." },
                remediation: {
                    attemptId: "checkfix_1",
                    checkName: "typecheck",
                    state: "passed",
                    requestedAt: "2026-08-31T00:00:00.000Z",
                    beforeStatus: "fail",
                    attestedAt: "2026-08-31T00:01:00.000Z",
                    afterStatus: "pass",
                    afterDetail: "Found 0 errors",
                    agentOutcome: "completed",
                },
            }],
        })).toEqual({
            available: true,
            mergeable: "",
            reviewDecision: "",
            githubAvailable: false,
            githubReason: "no pull request for the current branch",
            localRan: true,
            checks: [{
                name: "typecheck",
                status: "COMPLETED",
                conclusion: "FAILURE",
                source: "recoder",
                detail: "src/a.ts:1 TS2304",
                autofix: { prompt: "Fix the typecheck." },
                remediation: {
                    attemptId: "checkfix_1",
                    state: "passed",
                    requestedAt: "2026-08-31T00:00:00.000Z",
                    beforeStatus: "fail",
                    attestedAt: "2026-08-31T00:01:00.000Z",
                    afterStatus: "pass",
                    afterDetail: "Found 0 errors",
                    agentOutcome: "completed",
                },
            }],
        });
    });

    it("drops malformed remediation prompts rather than exposing a fix action", () => {
        expect(parseChecksData({
            available: true,
            checks: [{ name: "lint", source: "recoder", autofix: { prompt: 7 } }],
        }).checks).toEqual([{ name: "lint", status: "", conclusion: "", source: "recoder" }]);
    });

    it("coerces non-string mergeable/reviewDecision and a missing checks array", () => {
        const parsed = parseChecksData({ available: true, mergeable: 7, reviewDecision: null });
        expect(parsed).toEqual({ available: true, mergeable: "", reviewDecision: "", checks: [] });
    });
});

describe("canSendBlockerFeedback", () => {
    it("allows only server-reproducible hard blockers", () => {
        expect(canSendBlockerFeedback({ available: true, mergeable: "CONFLICTING", checks: [] })).toBe(true);
        expect(
            canSendBlockerFeedback({
                available: true,
                mergeable: "MERGEABLE",
                checks: [{ name: "tests", status: "COMPLETED", conclusion: "FAILURE" }],
            })
        ).toBe(true);
        expect(
            canSendBlockerFeedback({
                available: true,
                mergeable: "UNKNOWN",
                checks: [{ name: "tests", status: "IN_PROGRESS", conclusion: "" }],
            })
        ).toBe(false);
        expect(canSendBlockerFeedback({ available: false, reason: "no PR" })).toBe(false);
    });

    it("prefers canonical readiness over the older PR-only approximation", () => {
        expect(
            canSendBlockerFeedback(
                { available: false, reason: "no PR" },
                { available: true, verdict: "blocked", blockers: ["local checks failing: tests"] }
            )
        ).toBe(true);
        expect(
            canSendBlockerFeedback(
                { available: true, mergeable: "CONFLICTING", checks: [] },
                { available: true, verdict: "ready", blockers: [] }
            )
        ).toBe(false);
        expect(
            canSendBlockerFeedback(
                { available: true, mergeable: "CONFLICTING", checks: [] },
                { available: false, blockers: [], reason: "older backend" }
            )
        ).toBe(true);
    });
});

describe("parseReadinessData", () => {
    it("accepts canonical blocker and advisory arrays and drops malformed entries", () => {
        expect(parseReadinessData({
            verdict: "blocked",
            blockers: [" src/a.ts ", null, 7, "", "tests"],
            advisories: [" dependency review: zod added ", false, ""],
        })).toEqual({
            available: true,
            verdict: "blocked",
            blockers: ["src/a.ts", "tests"],
            advisories: ["dependency review: zod added"],
        });
    });

    it("degrades malformed payloads instead of inventing an empty ready state", () => {
        for (const payload of [null, [], {}, { verdict: "ready", blockers: "none" }]) {
            expect(parseReadinessData(payload)).toEqual({
                available: false,
                blockers: [],
                reason: "readiness unavailable",
            });
        }
    });

    it("carries the shared impact ledger into Review instead of rebuilding reference counts", () => {
        const parsed = parseReadinessData({
            verdict: "ready",
            blockers: [],
            review: {
                available: true,
                pr: 42,
                impact: {
                    available: true,
                    source: "recodergit",
                    scope: "file",
                    risk: "MEDIUM",
                    partial: true,
                    files: [{
                        path: "src/caller.ts",
                        isTest: false,
                        minDepth: 2,
                        directions: ["upstream"],
                        changedSymbols: ["charge"],
                        symbols: ["caller.ts"],
                        relationTypes: ["IMPORTED_BY"],
                        processes: [],
                        coChange: { commits: 5, confidence: 0.75 },
                    }],
                    tests: [],
                    processes: [{ label: "Checkout" }],
                    consumers: [{
                        repoId: "acme__checkout",
                        path: "src/checkout.ts",
                        ecosystem: "npm",
                        packageName: "@acme/payments",
                        importSpecifier: "@acme/payments/charge",
                    }],
                    summary: {
                        impactedFiles: 1,
                        affectedTests: 0,
                        upstreamFiles: 1,
                        downstreamFiles: 0,
                        affectedProcesses: 1,
                        coChangedFiles: 1,
                        crossRepositoryFiles: 1,
                        consumerRepositories: 1,
                    },
                },
            },
        });
        expect(parsed.review?.impact).toMatchObject({
            scope: "file",
            risk: "MEDIUM",
            partial: true,
            files: [{
                path: "src/caller.ts",
                minDepth: 2,
                directions: ["upstream"],
                coChange: { commits: 5, confidence: 0.75 },
            }],
            processes: [{ label: "Checkout" }],
            consumers: [{ repoId: "acme__checkout", path: "src/checkout.ts", packageName: "@acme/payments" }],
            summary: {
                impactedFiles: 1,
                upstreamFiles: 1,
                affectedProcesses: 1,
                coChangedFiles: 1,
                crossRepositoryFiles: 1,
                consumerRepositories: 1,
            },
        });
    });
});

describe("suggestEffectiveReviewAction", () => {
    it("turns a local-only canonical blocker into a blocking review decision", () => {
        expect(
            suggestEffectiveReviewAction(
                { available: false, reason: "no PR" },
                { available: true, verdict: "blocked", blockers: ["local checks failing: tests"] }
            )
        ).toEqual({ action: "address-feedback", label: "Recoder found hard blockers in this workspace" });
    });

    it("keeps the more specific GitHub conflict copy when both sources block", () => {
        expect(
            suggestEffectiveReviewAction(
                { available: true, mergeable: "CONFLICTING", checks: [] },
                { available: true, verdict: "blocked", blockers: ["src/a.ts"] }
            )
        ).toEqual({ action: "resolve-conflicts", label: "Merge conflicts — rebase or resolve before merging" });
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
        expect(suggestReviewAction({ available: false, reason: "no pull request for the current branch" })).toEqual({
            action: "create-pr",
            label: "No PR yet — create one to run checks and enable merge",
        });
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

    it("keeps polling a settled row while independent remediation attestation is pending", () => {
        expect(checksArePending({
            available: true,
            mergeable: "MERGEABLE",
            checks: [{
                name: "types",
                status: "COMPLETED",
                conclusion: "FAILURE",
                remediation: {
                    attemptId: "checkfix_1",
                    state: "running",
                    requestedAt: "2026-08-31T00:00:00.000Z",
                    beforeStatus: "fail",
                },
            }],
        })).toBe(true);
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
            .mockImplementation(() =>
                okJson({ available: true, mergeable: "MERGEABLE", reviewDecision: "", checks: [] })
            );
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

    function routeFetch(checksData: unknown, readinessData: unknown = { verdict: "ready", blockers: [] }) {
        return vi.fn().mockImplementation((url: string) => {
            if (url.endsWith("/checks")) {
                return okJson(checksData);
            }
            if (url.endsWith("/readiness")) {
                return okJson(readinessData);
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

    function countReadiness(fetchMock: ReturnType<typeof vi.fn>): number {
        return fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/readiness")).length;
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

    it("re-probes canonical readiness slowly while blockers remain, never on every tick", async () => {
        const fetchMock = routeFetch(
            { available: false, reason: "local repo" },
            { verdict: "blocked", blockers: ["local checks failing: test"] }
        );
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();
        expect(countReadiness(fetchMock)).toBe(1);

        model.readinessProbedAtMs = Date.now();
        await model.refresh();
        expect(countReadiness(fetchMock)).toBe(1);

        model.readinessProbedAtMs = 0;
        await model.refresh();
        expect(countReadiness(fetchMock)).toBe(2);
    });

    it("stops readiness re-probing as soon as the agent clears the blockers", async () => {
        let readiness = { verdict: "blocked", blockers: ["secret added: token"] };
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            if (url.endsWith("/checks")) return okJson({ available: false, reason: "local repo" });
            if (url.endsWith("/readiness")) return okJson(readiness);
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
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();
        expect(countReadiness(fetchMock)).toBe(1);

        readiness = { verdict: "ready", blockers: [] };
        model.readinessProbedAtMs = 0;
        await model.refresh();
        expect(countReadiness(fetchMock)).toBe(2);
        expect(globalStore.get(model.readinessAtom)?.blockers).toEqual([]);

        model.readinessProbedAtMs = 0;
        await model.refresh();
        expect(countReadiness(fetchMock)).toBe(2);
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

describe("RecoderDiffViewModel.requestCheckAutofix", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("requests governed named remediation and starts polling its independent attestation", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
            if (init?.method == "POST") return Promise.resolve({ ok: true, status: 201, json: async () => ({}) });
            return okJson({ available: true, checks: [{
                name: "types",
                status: "COMPLETED",
                conclusion: "FAILURE",
                source: "recoder",
                autofix: { prompt: "server-only prompt" },
                remediation: {
                    attemptId: "checkfix_1",
                    state: "running",
                    requestedAt: "2026-08-31T00:00:00.000Z",
                    beforeStatus: "fail",
                },
            }] });
        });
        vi.stubGlobal("fetch", fetchMock);
        const model = makeModel();

        await expect(model.requestCheckAutofix("ws-1", {
            name: "types",
            status: "COMPLETED",
            conclusion: "FAILURE",
            source: "recoder",
            autofix: { prompt: "Fix the exact type check." },
        })).resolves.toContain("Recoder will rerun it independently");
        expect(fetchMock).toHaveBeenCalledWith(`${BaseUrl}/ws-1/checks/remediate`, expect.objectContaining({
            method: "POST",
            body: JSON.stringify({ checkName: "types" }),
        }));
        expect(fetchMock).toHaveBeenCalledWith(`${BaseUrl}/ws-1/checks`);
        expect(globalStore.get(model.checksAtom)?.checks?.[0]?.remediation?.state).toBe("running");
    });

    it("never sends a manual/advisory check to an agent", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const model = makeModel();
        await expect(model.requestCheckAutofix("ws-1", {
            name: "security review",
            status: "COMPLETED",
            conclusion: "FAILURE",
            source: "recoder",
        })).resolves.toContain("advisory");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("RecoderDiffViewModel.fetchReadiness", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("loads canonical blockers and review advisories from the readiness edge", async () => {
        const fetchMock = vi
            .fn()
            .mockImplementation(() =>
                okJson({
                    verdict: "blocked",
                    blockers: ["local checks failing: tests", "secret added: token"],
                    advisories: ["dependency review: zod@^4.0.0 added (package.json)"],
                })
            );
        vi.stubGlobal("fetch", fetchMock);
        const model = makeModel();

        await model.fetchReadiness("ws-1");

        expect(fetchMock).toHaveBeenCalledWith(`${BaseUrl}/ws-1/readiness`);
        expect(globalStore.get(model.readinessAtom)).toEqual({
            available: true,
            verdict: "blocked",
            blockers: ["local checks failing: tests", "secret added: token"],
            advisories: ["dependency review: zod@^4.0.0 added (package.json)"],
        });
        expect(globalStore.get(model.readinessLoadingAtom)).toBe(false);
    });

    it("degrades a missing endpoint truthfully and clears on an empty selection", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
        vi.stubGlobal("fetch", fetchMock);
        const model = makeModel();

        await model.fetchReadiness("ws-1");
        expect(globalStore.get(model.readinessAtom)).toEqual({
            available: false,
            blockers: [],
            reason: "readiness endpoint not available",
        });

        await model.fetchReadiness("");
        expect(globalStore.get(model.readinessAtom)).toBe(null);
        expect(globalStore.get(model.readinessLoadingAtom)).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("keeps the known blockers visible during a same-workspace slow re-probe", async () => {
        let resolveFetch: (value: unknown) => void;
        const pending = new Promise((resolve) => {
            resolveFetch = resolve;
        });
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(() => pending)
        );
        const model = makeModel();
        model.readinessWorkspaceId = "ws-1";
        globalStore.set(model.readinessAtom, {
            available: true,
            verdict: "blocked",
            blockers: ["local checks failing: test"],
        });

        const probe = model.fetchReadiness("ws-1");
        expect(globalStore.get(model.readinessAtom)?.blockers).toEqual(["local checks failing: test"]);

        resolveFetch!({
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: { verdict: "ready", blockers: [] } }),
        });
        await probe;
        expect(globalStore.get(model.readinessAtom)?.blockers).toEqual([]);
    });
});

describe("RecoderDiffViewModel.mergeSelected", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("surfaces the backend trust advisory after a successful warn-mode merge", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                success: true,
                data: {
                    merge: {
                        merged: true,
                        trustWarning: "Low convergence trust. Review: local tests failing",
                        trustTier: "low",
                        trustScore: 31,
                    },
                },
            }),
        });
        vi.stubGlobal("fetch", fetchMock);
        const model = makeModel();
        const refresh = vi.spyOn(model, "refresh").mockResolvedValue(undefined);
        globalStore.set(model.selectedIdAtom, "ws-1");

        await model.mergeSelected();

        expect(fetchMock).toHaveBeenCalledWith(
            `${BaseUrl}/ws-1/merge`,
            expect.objectContaining({ method: "POST", body: "{}" })
        );
        expect(globalStore.get(model.mergeStatusAtom)).toBe(
            "Merged. Trust advisory (low, 31/100): Low convergence trust. Review: local tests failing"
        );
        expect(globalStore.get(model.mergingAtom)).toBe(false);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("renders an unjudgeable merge as human review rather than a service failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: false,
            status: 409,
            json: async () => ({
                success: false,
                error: {
                    message: "merge escalated to human review — trust could not be judged",
                    details: { outcome: "escalated" },
                },
            }),
        }));
        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");

        await model.mergeSelected();

        expect(globalStore.get(model.mergeStatusAtom)).toBe(
            "Human review required — merge escalated to human review — trust could not be judged."
        );
    });

    it("renders a judged low-trust refusal separately from governance", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: false,
            status: 409,
            json: async () => ({
                success: false,
                error: {
                    message: "merge blocked by trust gate — low trust",
                    details: { outcome: "trust_blocked" },
                },
            }),
        }));
        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");

        await model.mergeSelected();

        expect(globalStore.get(model.mergeStatusAtom)).toBe(
            "Merge blocked by convergence trust — merge blocked by trust gate — low trust."
        );
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
            return okJson({
                workspaceId: "ws-2",
                baseRef: "main",
                branch: "b",
                stat: "",
                patch: "",
                untracked: [],
                changedFiles: 0,
            });
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

    it("switching workspaces clears blocker-feedback copy from the previous workspace", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
        const model = makeModel();
        globalStore.set(model.blockerFeedbackStatusAtom, "Sent 2 blockers to the agent.");

        await model.selectWorkspace("");

        expect(globalStore.get(model.blockerFeedbackStatusAtom)).toBe("");
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
            json: async () => ({
                success: true,
                data: { available: true, mergeable: "CONFLICTING", reviewDecision: "", checks: [] },
            }),
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
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation(() => slow)
        );

        const model = makeModel();
        globalStore.set(model.checksAtom, { available: true, mergeable: "MERGEABLE", reviewDecision: "", checks: [] });
        const pending = model.fetchChecks("ws-next");

        expect(globalStore.get(model.checksAtom)).toBe(null);
        resolveSlow!({
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: { available: false, reason: "x" } }),
        });
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

        expect(globalStore.get(model.checksAtom)).toEqual({
            available: false,
            reason: "checks endpoint not available",
        });
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

    it("addComment carries side:old only for a deletion (new is default, omitted)", () => {
        const model = makeModel();
        model.addComment("src/a.ts", 2, "restore this", "old");
        model.addComment("src/a.ts", 5, "rename", "new");
        expect(globalStore.get(model.pendingCommentsAtom)).toEqual([
            { file: "src/a.ts", line: 2, body: "restore this", side: "old" },
            { file: "src/a.ts", line: 5, body: "rename" },
        ]);
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

    it("sendBlockerFeedback posts no client blocker prose and reports the canonical count", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    success: true,
                    data: { feedback: { delivery: "steer", blockers: ["src/a.ts", "tests"] } },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ success: true, data: { available: true, checks: [] } }),
            });
        vi.stubGlobal("fetch", fetchMock);
        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");

        await model.sendBlockerFeedback();

        expect(fetchMock.mock.calls[0]).toEqual([
            `${BaseUrl}/ws-1/blocker-feedback`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
        ]);
        expect(globalStore.get(model.blockerFeedbackStatusAtom)).toBe("Sent 2 blockers to the agent.");
        expect(globalStore.get(model.blockerFeedbackSendingAtom)).toBe(false);
    });

    it("sendBlockerFeedback surfaces a truthful stale/no-blocker refusal", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
                json: async () => ({ success: false, error: { message: "steer keys must be non-empty" } }),
            })
        );
        const model = makeModel();
        globalStore.set(model.selectedIdAtom, "ws-1");

        await model.sendBlockerFeedback();

        expect(globalStore.get(model.blockerFeedbackStatusAtom)).toBe(
            "Could not send blockers — steer keys must be non-empty."
        );
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
