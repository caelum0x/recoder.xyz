// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore(), createBlock: vi.fn() };
});

vi.mock("./recoder-runs", () => ({
    RecoderRunsView: () => null,
}));

import { globalStore } from "@/app/store/global";
import {
    activeDriftFindings,
    driftForRun,
    driftLabel,
    parseReconcileFindings,
    unpinnedDriftFindings,
    type RunsDriftFinding,
} from "./recoder-runs-findings";
import { RecoderRunsViewModel } from "./recoder-runs-model";

function finding(overrides: Partial<RunsDriftFinding> = {}): RunsDriftFinding {
    return {
        findingId: "f1",
        kind: "crashed",
        resolved: false,
        ...overrides,
    };
}

describe("parseReconcileFindings", () => {
    it("reads the live envelope { data: { findings: [...] } }", () => {
        const body = {
            success: true,
            data: {
                findings: [
                    {
                        findingId: "f1",
                        workspaceId: "w1",
                        kind: "crashed",
                        sessionName: "recoder-w1",
                        worktreePath: "/tmp/w1",
                        observedAt: "2026-08-01T10:00:00Z",
                        resolved: false,
                    },
                ],
            },
        };
        expect(parseReconcileFindings(body)).toEqual([
            {
                findingId: "f1",
                workspaceId: "w1",
                kind: "crashed",
                sessionName: "recoder-w1",
                worktreePath: "/tmp/w1",
                observedAt: "2026-08-01T10:00:00Z",
                resolved: false,
            },
        ]);
    });

    it("tolerates a bare { data: [...] } and ignores extra fields", () => {
        const body = {
            data: [{ findingId: "f1", kind: "orphan_session", detail: { pid: 42 }, resolved: false }],
        };
        expect(parseReconcileFindings(body)).toEqual([
            { findingId: "f1", kind: "orphan_session", resolved: false },
        ]);
    });

    it("skips rows that are not objects or missing a findingId", () => {
        const body = { data: { findings: [{ findingId: "f1", kind: "crashed" }, { kind: "crashed" }, "junk", null] } };
        expect(parseReconcileFindings(body)?.map((f) => f.findingId)).toEqual(["f1"]);
    });

    it("returns null (transport-failure semantics) for a malformed body", () => {
        expect(parseReconcileFindings(null)).toBeNull();
        expect(parseReconcileFindings({})).toBeNull();
        expect(parseReconcileFindings({ data: { findings: "nope" } })).toBeNull();
        expect(parseReconcileFindings({ data: 3 })).toBeNull();
        expect(parseReconcileFindings("weird")).toBeNull();
    });
});

describe("activeDriftFindings", () => {
    it("drops resolved findings and healthy 'live' entries", () => {
        const out = activeDriftFindings([
            finding({ findingId: "f1", kind: "crashed" }),
            finding({ findingId: "f2", kind: "crashed", resolved: true }),
            finding({ findingId: "f3", kind: "live" }),
        ]);
        expect(out.map((f) => f.findingId)).toEqual(["f1"]);
    });

    it("sorts newest observedAt first (missing sorts last) without mutating the input", () => {
        const input = [
            finding({ findingId: "f1", observedAt: "2026-08-01T10:00:00Z" }),
            finding({ findingId: "f2" }),
            finding({ findingId: "f3", observedAt: "2026-08-01T12:00:00Z" }),
        ];
        const out = activeDriftFindings(input);
        expect(out.map((f) => f.findingId)).toEqual(["f3", "f1", "f2"]);
        expect(input.map((f) => f.findingId)).toEqual(["f1", "f2", "f3"]);
    });
});

describe("driftLabel", () => {
    it("maps each drift kind to honest copy", () => {
        expect(driftLabel("orphan_session")).toBe("session running with no record");
        expect(driftLabel("orphan_worktree")).toBe("worktree left behind");
        expect(driftLabel("dangling_record")).toBe("record without session/worktree");
        expect(driftLabel("crashed")).toBe("session died");
    });

    it("passes an unknown kind through raw instead of hiding it", () => {
        expect(driftLabel("some_new_kind")).toBe("some_new_kind");
    });
});

describe("driftForRun", () => {
    const correlation = new Map([["run-1", "w1"]]);

    it("picks up only the correlated workspace's findings", () => {
        const findings = [
            finding({ findingId: "f1", workspaceId: "w1" }),
            finding({ findingId: "f2", workspaceId: "w2" }),
        ];
        expect(driftForRun("run-1", correlation, findings).map((f) => f.findingId)).toEqual(["f1"]);
    });

    it("returns [] for an uncorrelated run", () => {
        expect(driftForRun("run-2", correlation, [finding({ workspaceId: "w1" })])).toEqual([]);
    });

    it("excludes findings without a workspaceId from row badges", () => {
        const findings = [finding({ findingId: "f1" }), finding({ findingId: "f2", workspaceId: "w1" })];
        expect(driftForRun("run-1", correlation, findings).map((f) => f.findingId)).toEqual(["f2"]);
    });
});

describe("unpinnedDriftFindings", () => {
    const correlation = new Map([["run-1", "w1"]]);

    it("keeps only findings no run row can pin (unlinked or an uncorrelated workspace)", () => {
        const findings = [
            finding({ findingId: "f1", workspaceId: "w1" }),
            finding({ findingId: "f2", workspaceId: "w2" }),
            finding({ findingId: "f3" }),
        ];
        expect(unpinnedDriftFindings(findings, correlation).map((f) => f.findingId)).toEqual(["f2", "f3"]);
    });

    it("returns everything when nothing is correlated (no row carries the marker)", () => {
        const findings = [finding({ findingId: "f1", workspaceId: "w1" })];
        expect(unpinnedDriftFindings(findings, new Map()).map((f) => f.findingId)).toEqual(["f1"]);
    });

    it("returns [] when every finding is already pinned to a correlated run", () => {
        const findings = [finding({ findingId: "f1", workspaceId: "w1" })];
        expect(unpinnedDriftFindings(findings, correlation)).toEqual([]);
    });
});

function okJson(data: unknown) {
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });
}

function mockRunsFetch(overrides: Record<string, () => Promise<unknown>> = {}) {
    return vi.fn().mockImplementation((url: string) => {
        const path = String(url);
        for (const [suffix, respond] of Object.entries(overrides)) {
            if (path.endsWith(suffix)) {
                return respond();
            }
        }
        if (path.endsWith("/api/conductor/workspaces")) {
            return okJson({ workspaces: [] });
        }
        if (path.endsWith("/api/conductor/reconcile/findings")) {
            return okJson({ findings: [] });
        }
        return okJson([]);
    });
}

function makeModel(): RecoderRunsViewModel {
    return new RecoderRunsViewModel({ blockId: "b1" } as ViewModelInitType);
}

describe("RecoderRunsViewModel.refresh drift findings", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("loads findings from /api/conductor/reconcile/findings with status 'ok'", async () => {
        const raw = { findingId: "f1", workspaceId: "w1", kind: "crashed", observedAt: "x", resolved: false };
        const fetchMock = mockRunsFetch({
            "/api/conductor/reconcile/findings": () => okJson({ findings: [raw] }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();

        expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3100/api/conductor/reconcile/findings");
        expect(globalStore.get(model.findingsAtom)).toEqual([
            { findingId: "f1", workspaceId: "w1", kind: "crashed", observedAt: "x", resolved: false },
        ]);
        expect(globalStore.get(model.findingsStatusAtom)).toBe("ok");
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("degrades to 'unavailable' on a findings 500 without failing the runs refresh", async () => {
        const run = { runId: "r1", taskId: "t1", spaceId: "s1", state: "running", updatedAt: "x" };
        const fetchMock = mockRunsFetch({
            "/api/agent-os/runs": () => okJson([run]),
            "/api/conductor/reconcile/findings": () =>
                Promise.resolve({ ok: false, status: 500, json: async () => ({}) }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.runsAtom)).toEqual([run]);
        expect(globalStore.get(model.connectedAtom)).toBe(true);
        expect(globalStore.get(model.findingsAtom)).toEqual([]);
        expect(globalStore.get(model.findingsStatusAtom)).toBe("unavailable");
    });

    it("degrades to 'unavailable' on a malformed findings body", async () => {
        const fetchMock = mockRunsFetch({
            "/api/conductor/reconcile/findings": () => okJson({ nope: true }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.refresh();

        expect(globalStore.get(model.findingsAtom)).toEqual([]);
        expect(globalStore.get(model.findingsStatusAtom)).toBe("unavailable");
    });

    it("resets findings state when the whole refresh fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        globalStore.set(model.findingsAtom, [finding()]);
        globalStore.set(model.findingsStatusAtom, "ok");
        await model.refresh();

        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.findingsAtom)).toEqual([]);
        expect(globalStore.get(model.findingsStatusAtom)).toBe("unavailable");
    });
});
