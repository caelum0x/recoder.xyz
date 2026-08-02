// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";
import {
    fetchWorkspacePrStatus,
    parsePrStatusEnvelope,
    prChipLabel,
    prChipTone,
    prStatusFetchKey,
    shouldRefetchPrStatus,
    workspacePrStatusUrl,
    PrStatusRefreshMs,
} from "./recoder-pr-status";
import type { RecoderWorkspace } from "./recoder-board-logic";

function ws(overrides: Partial<RecoderWorkspace> = {}): RecoderWorkspace {
    return {
        workspaceId: "ws-1",
        branch: "feat/x",
        runtimeId: "claude-code",
        worktreePath: "/tmp/wt",
        state: "awaiting_review",
        updatedAt: "2026-08-02T10:00:00Z",
        ...overrides,
    } as RecoderWorkspace;
}

describe("workspacePrStatusUrl", () => {
    it("builds the pr-status URL with an encoded workspace id", () => {
        expect(workspacePrStatusUrl("http://127.0.0.1:3100", "ws-1")).toBe(
            "http://127.0.0.1:3100/api/conductor/workspaces/ws-1/pr-status",
        );
        expect(workspacePrStatusUrl("http://127.0.0.1:3100", "ws/../x")).toBe(
            "http://127.0.0.1:3100/api/conductor/workspaces/ws%2F..%2Fx/pr-status",
        );
    });
});

describe("parsePrStatusEnvelope", () => {
    it("projects an open PR with a checks rollup", () => {
        const chip = parsePrStatusEnvelope({
            success: true,
            data: {
                available: true,
                hasPr: true,
                number: 12,
                state: "open",
                draft: false,
                url: "https://github.com/o/r/pull/12",
                checks: { total: 3, passed: 3, failed: 0, pending: 0, rollup: "passing" },
            },
        });
        expect(chip).toEqual({ number: 12, state: "open", url: "https://github.com/o/r/pull/12", checks: "passing" });
    });

    it("folds the draft flag into a draft state", () => {
        const chip = parsePrStatusEnvelope({
            data: { available: true, hasPr: true, number: 7, state: "open", draft: true },
        });
        expect(chip.state).toBe("draft");
        expect(chip.checks).toBe("none");
        expect(chip.url).toBe("");
    });

    it("keeps merged and closed states (draft never overrides them)", () => {
        expect(
            parsePrStatusEnvelope({ data: { available: true, hasPr: true, number: 1, state: "merged", draft: true } })
                .state,
        ).toBe("merged");
        expect(
            parsePrStatusEnvelope({ data: { available: true, hasPr: true, number: 2, state: "closed" } }).state,
        ).toBe("closed");
    });

    it("yields null when gh is unavailable, there is no PR, or the shape is garbage — never a fabricated PR", () => {
        expect(parsePrStatusEnvelope(null)).toBeNull();
        expect(parsePrStatusEnvelope("nope")).toBeNull();
        expect(parsePrStatusEnvelope({ data: null })).toBeNull();
        expect(parsePrStatusEnvelope({ data: { available: false, hasPr: false, reason: "gh not found" } })).toBeNull();
        expect(parsePrStatusEnvelope({ data: { available: true, hasPr: false, reason: "no PR" } })).toBeNull();
        expect(parsePrStatusEnvelope({ data: { available: true, hasPr: true, number: "12" } })).toBeNull();
    });

    it("degrades an unknown state/rollup to open/none rather than breaking", () => {
        const chip = parsePrStatusEnvelope({
            data: { available: true, hasPr: true, number: 3, state: "WEIRD", checks: { rollup: "weird" } },
        });
        expect(chip.state).toBe("open");
        expect(chip.checks).toBe("none");
    });
});

describe("prChipLabel / prChipTone", () => {
    it("labels the PR number + state, appending a real checks rollup only", () => {
        expect(prChipLabel({ number: 12, state: "open", url: "", checks: "passing" })).toBe(
            "PR #12 open · checks passing",
        );
        expect(prChipLabel({ number: 7, state: "draft", url: "", checks: "none" })).toBe("PR #7 draft");
    });

    it("tones by PR state, with failing checks overriding to the alert tone", () => {
        const open = prChipTone({ number: 1, state: "open", url: "", checks: "none" });
        const merged = prChipTone({ number: 1, state: "merged", url: "", checks: "none" });
        const failing = prChipTone({ number: 1, state: "open", url: "", checks: "failing" });
        const closed = prChipTone({ number: 1, state: "closed", url: "", checks: "none" });
        expect(open).not.toBe(merged);
        expect(failing).toBe(closed);
    });
});

describe("shouldRefetchPrStatus", () => {
    const now = 1_000_000;

    it("fetches on first sight and when the workspace revision advances", () => {
        const w = ws();
        expect(shouldRefetchPrStatus(w, null, now)).toBe(true);
        const meta = { key: prStatusFetchKey(w), at: now };
        expect(shouldRefetchPrStatus(w, meta, now + 6_000)).toBe(false);
        expect(shouldRefetchPrStatus(ws({ updatedAt: "2026-08-02T11:00:00Z" }), meta, now + 6_000)).toBe(true);
    });

    it("re-asks an unchanged row only after the refresh interval (GitHub moves without the local row)", () => {
        const w = ws();
        const meta = { key: prStatusFetchKey(w), at: now };
        expect(shouldRefetchPrStatus(w, meta, now + PrStatusRefreshMs - 1)).toBe(false);
        expect(shouldRefetchPrStatus(w, meta, now + PrStatusRefreshMs)).toBe(true);
    });
});

describe("fetchWorkspacePrStatus", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("fetches the pr-status read and projects the payload", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                success: true,
                data: { available: true, hasPr: true, number: 5, state: "open", url: "https://x/pull/5" },
            }),
        });
        vi.stubGlobal("fetch", fetchMock);
        const chip = await fetchWorkspacePrStatus("http://127.0.0.1:3100", "ws-1");
        expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3100/api/conductor/workspaces/ws-1/pr-status");
        expect(chip).toEqual({ number: 5, state: "open", url: "https://x/pull/5", checks: "none" });
    });

    it("returns null without a request when no workspace is bound", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        expect(await fetchWorkspacePrStatus("http://x", "")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns null on HTTP failure, non-JSON body, and thrown transport errors", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }));
        expect(await fetchWorkspacePrStatus("http://x", "ws-1")).toBeNull();

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => {
                    throw new Error("bad json");
                },
            }),
        );
        expect(await fetchWorkspacePrStatus("http://x", "ws-1")).toBeNull();

        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("refused")));
        expect(await fetchWorkspacePrStatus("http://x", "ws-1")).toBeNull();
    });
});
