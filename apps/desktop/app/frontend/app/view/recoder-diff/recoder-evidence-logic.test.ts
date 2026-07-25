// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

import {
    fetchEvidenceExport,
    fetchEvidenceMarkdown,
    normalizeStatus,
    parseEvidenceExport,
} from "./recoder-evidence-logic";

function mockFetchOnce(body: unknown, status = 200, asText = false): void {
    const init = { status, headers: { "Content-Type": asText ? "text/markdown" : "application/json" } };
    const payload = asText ? String(body) : JSON.stringify(body);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(payload, init));
}

const FULL_EXPORT = {
    schema: "recoder.evidence.v1",
    generatedFrom: "sha256:abc",
    generatedAt: "2026-07-26T00:00:00Z",
    evidenceIntegrity: { verified: true },
    subject: {
        taskId: "t1",
        taskGroup: "grp1",
        chosenWorkspaceId: "ws_conv",
        mergedAt: "2026-07-26T00:00:00Z",
        actorId: "actor1",
        candidateCount: 3,
        evidenceSchema: "recoder.convergence.evidence",
        auditEntryHash: "sha256:def",
    },
    controls: [
        { id: "CC8.1", framework: "SOC2", title: "Change mgmt", requirement: "req", status: "met", evidenceRefs: ["r1"] },
        {
            id: "AC-3",
            framework: "NIST",
            title: "Access enforcement",
            requirement: "req",
            status: "partial",
            evidenceRefs: [],
            reason: "no reviewer approval captured",
        },
        {
            id: "A.12.1",
            framework: "ISO27001",
            title: "Ops procedures",
            requirement: "req",
            status: "not-evidenced",
            evidenceRefs: [],
            reason: "no durable audit trail",
        },
    ],
    coverage: { met: 1, partial: 1, notEvidenced: 1, total: 3 },
    summary: "# Evidence\n...",
    contentHash: "sha256:pack",
};

describe("normalizeStatus — never coerces an unknown status into a pass", () => {
    it("keeps the three known statuses", () => {
        expect(normalizeStatus("met")).toBe("met");
        expect(normalizeStatus("partial")).toBe("partial");
        expect(normalizeStatus("not-evidenced")).toBe("not-evidenced");
    });

    it("falls unknown/garbage to the conservative not-evidenced", () => {
        expect(normalizeStatus("passed")).toBe("not-evidenced");
        expect(normalizeStatus("")).toBe("not-evidenced");
        expect(normalizeStatus(null)).toBe("not-evidenced");
        expect(normalizeStatus(true)).toBe("not-evidenced");
    });
});

describe("parseEvidenceExport — truthful projection of coverage + controls", () => {
    it("reads a full export: subject facts, integrity, coverage, and every control", () => {
        const view = parseEvidenceExport(FULL_EXPORT);
        expect(view.schema).toBe("recoder.evidence.v1");
        expect(view.taskGroup).toBe("grp1");
        expect(view.chosenWorkspaceId).toBe("ws_conv");
        expect(view.integrityVerified).toBe(true);
        expect(view.coverage).toEqual({ met: 1, partial: 1, notEvidenced: 1, total: 3 });
        expect(view.contentHash).toBe("sha256:pack");
        expect(view.controls).toEqual([
            { id: "CC8.1", framework: "SOC2", title: "Change mgmt", status: "met", reason: "", evidenceRefs: ["r1"] },
            {
                id: "AC-3",
                framework: "NIST",
                title: "Access enforcement",
                status: "partial",
                reason: "no reviewer approval captured",
                evidenceRefs: [],
            },
            {
                id: "A.12.1",
                framework: "ISO27001",
                title: "Ops procedures",
                status: "not-evidenced",
                reason: "no durable audit trail",
                evidenceRefs: [],
            },
        ]);
    });

    it("surfaces partials/not-evidenced — never hides them or fakes verified", () => {
        const view = parseEvidenceExport({
            controls: [
                { id: "C1", framework: "SOC2", status: "partial" },
                { id: "C2", framework: "SOC2", status: "bogus" },
            ],
            coverage: { met: 0, partial: 1, notEvidenced: 1, total: 2 },
            evidenceIntegrity: { verified: "yes" },
        });
        expect(view.integrityVerified).toBe(false);
        expect(view.controls.map((c) => c.status)).toEqual(["partial", "not-evidenced"]);
        expect(view.coverage.partial).toBe(1);
        expect(view.coverage.notEvidenced).toBe(1);
    });

    it("degrades a garbage body to a neutral, never-verified view", () => {
        const view = parseEvidenceExport({});
        expect(view.integrityVerified).toBe(false);
        expect(view.controls).toEqual([]);
        expect(view.coverage).toEqual({ met: 0, partial: 0, notEvidenced: 0, total: 0 });
    });
});

describe("fetchEvidenceExport — envelope unwrap + truthful 404", () => {
    afterEach(() => vi.restoreAllMocks());

    it("unwraps { data: { export } } (not one level too shallow)", async () => {
        mockFetchOnce({ success: true, data: { export: FULL_EXPORT } });
        const result = await fetchEvidenceExport("ws_conv");
        expect(result.ok).toBe(true);
        // Would be met:0 / no controls if the `.export` sub-key were not unwrapped.
        expect(result.ok && result.view.coverage.met).toBe(1);
        expect(result.ok && result.view.controls.length).toBe(3);
    });

    it("maps a 404 to the no-evidence signal — not an error", async () => {
        mockFetchOnce({ success: false, error: { message: "no evidence" } }, 404);
        const result = await fetchEvidenceExport("ws_plain");
        expect(result.ok).toBe(false);
        expect(result.noEvidence).toBe(true);
        expect(result.error).toBeUndefined();
    });

    it("surfaces a non-404 failure reason verbatim", async () => {
        mockFetchOnce({ success: false, error: { message: "backend degraded" } }, 503);
        const result = await fetchEvidenceExport("ws_conv");
        expect(result.ok).toBe(false);
        expect(result.noEvidence).toBeUndefined();
        expect(result.error).toBe("backend degraded");
    });
});

describe("fetchEvidenceMarkdown — raw text + 404 discipline", () => {
    afterEach(() => vi.restoreAllMocks());

    it("returns the raw markdown text on 200", async () => {
        mockFetchOnce("# Recoder Evidence\n- met: 1", 200, true);
        const result = await fetchEvidenceMarkdown("ws_conv");
        expect(result.ok).toBe(true);
        expect(result.ok && result.markdown).toContain("# Recoder Evidence");
    });

    it("maps a 404 to the no-evidence signal", async () => {
        mockFetchOnce("not found", 404, true);
        const result = await fetchEvidenceMarkdown("ws_plain");
        expect(result.ok).toBe(false);
        expect(result.noEvidence).toBe(true);
    });
});
