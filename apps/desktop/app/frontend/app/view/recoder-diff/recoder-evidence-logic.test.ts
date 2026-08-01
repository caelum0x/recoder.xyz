// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

import {
    deriveSignatureStatus,
    deriveVerifiedSignature,
    fetchEvidenceExport,
    fetchEvidenceMarkdown,
    fetchPreviewVerification,
    normalizeStatus,
    parseEvidenceExport,
    parsePreviewVerification,
    signaturePublicKeyFingerprint,
    type EvidenceExportView,
    type EvidenceSignatureView,
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

const SIGNATURE = {
    algorithm: "ed25519",
    publicKeyPem: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=\n-----END PUBLIC KEY-----\n",
    signedContentHash: "sha256:pack",
    signature: "c2lnbmF0dXJlLWJ5dGVz",
    signedAt: "2026-07-26T00:00:00Z",
};

function signedView(overrides?: Partial<EvidenceSignatureView>): EvidenceExportView {
    return parseEvidenceExport({ ...FULL_EXPORT, signature: { ...SIGNATURE, ...overrides } });
}

describe("parseEvidenceExport — signature block (additive, tolerant)", () => {
    it("reads a present signature block", () => {
        const view = parseEvidenceExport({ ...FULL_EXPORT, signature: SIGNATURE });
        expect(view.signature).toEqual({
            algorithm: "ed25519",
            publicKeyPem: SIGNATURE.publicKeyPem,
            signedContentHash: "sha256:pack",
            signature: "c2lnbmF0dXJlLWJ5dGVz",
            signedAt: "2026-07-26T00:00:00Z",
        });
    });

    it("omits the block when absent, null, or missing the signature/hash (unsigned, not faked)", () => {
        expect(parseEvidenceExport(FULL_EXPORT).signature).toBeUndefined();
        expect(parseEvidenceExport({ ...FULL_EXPORT, signature: null }).signature).toBeUndefined();
        expect(parseEvidenceExport({ ...FULL_EXPORT, signature: { algorithm: "ed25519" } }).signature).toBeUndefined();
    });
});

describe("deriveSignatureStatus — pure hash-match trust (no crypto)", () => {
    it("unsigned when there is no signature", () => {
        expect(deriveSignatureStatus(parseEvidenceExport(FULL_EXPORT))).toEqual({ status: "unsigned", reason: "" });
    });

    it("signed when present and the signed hash matches the pack contentHash", () => {
        expect(deriveSignatureStatus(signedView())).toEqual({ status: "signed", reason: "" });
    });

    it("invalid (tampered) when the signed hash differs from the pack contentHash — no crypto needed", () => {
        const state = deriveSignatureStatus(signedView({ signedContentHash: "sha256:OTHER" }));
        expect(state.status).toBe("invalid");
        expect(state.reason).toContain("different contentHash");
    });
});

describe("deriveVerifiedSignature — truthful crypto upgrade (injected verifier)", () => {
    it("upgrades signed → verified only on a real true", async () => {
        const state = await deriveVerifiedSignature(signedView(), async () => true);
        expect(state).toEqual({ status: "verified", reason: "" });
    });

    it("downgrades signed → invalid on a real false (tampered)", async () => {
        const state = await deriveVerifiedSignature(signedView(), async () => false);
        expect(state.status).toBe("invalid");
        expect(state.reason).toContain("did not verify");
    });

    it("STAYS signed when the verifier is unavailable (null) — never faked, never downgraded", async () => {
        const state = await deriveVerifiedSignature(signedView(), async () => null);
        expect(state).toEqual({ status: "signed", reason: "" });
    });

    it("STAYS signed when the verifier throws — never throws into render", async () => {
        const state = await deriveVerifiedSignature(signedView(), async () => {
            throw new Error("crypto exploded");
        });
        expect(state).toEqual({ status: "signed", reason: "" });
    });

    it("never runs crypto for a hash-mismatch: invalid stays invalid regardless of verifier", async () => {
        let called = false;
        const state = await deriveVerifiedSignature(signedView({ signedContentHash: "sha256:OTHER" }), async () => {
            called = true;
            return true;
        });
        expect(state.status).toBe("invalid");
        expect(called).toBe(false);
    });
});

describe("signaturePublicKeyFingerprint — stable, env-tolerant", () => {
    it("is deterministic and either a 12-hex digest or empty when crypto is unavailable", async () => {
        const fp1 = await signaturePublicKeyFingerprint(SIGNATURE.publicKeyPem);
        const fp2 = await signaturePublicKeyFingerprint(SIGNATURE.publicKeyPem);
        expect(fp1).toBe(fp2);
        expect(fp1).toMatch(/^[0-9a-f]{0,12}$/);
    });

    it("returns empty for a non-PEM input (never a fabricated fingerprint)", async () => {
        expect(await signaturePublicKeyFingerprint("")).toBe("");
        expect(await signaturePublicKeyFingerprint("not a pem")).toBe("");
    });
});

const FULL_PREVIEW_VERIFICATION = {
    workspaceId: "ws1",
    status: "failed",
    checkedAt: "2026-07-30T00:00:00Z",
    summary: "1 of 2 assertions failed",
    degraded: false,
    reason: "assertion missing: Welcome",
    checks: [
        { tool: "browser_open", status: "passed" },
        { tool: "assert_text", status: "failed", message: "missing: Welcome" },
        { tool: "screenshot", status: "skipped", message: "engine unavailable" },
    ],
    screenshotRef: null,
};

describe("parsePreviewVerification — truthful projection of the persisted record", () => {
    it("preserves status/degraded/reason and maps every check; screenshotRef:null → the not-retained note", () => {
        const view = parsePreviewVerification(FULL_PREVIEW_VERIFICATION);
        expect(view.status).toBe("failed");
        expect(view.checkedAt).toBe("2026-07-30T00:00:00Z");
        expect(view.summary).toBe("1 of 2 assertions failed");
        expect(view.degraded).toBe(false);
        expect(view.reason).toBe("assertion missing: Welcome");
        expect(view.checks).toEqual([
            { name: "browser_open", status: "passed" },
            { name: "assert_text", status: "failed", detail: "missing: Welcome" },
            { name: "screenshot", status: "skipped", detail: "engine unavailable" },
        ]);
        expect(view.screenshotNote).toBe("screenshot not retained");
    });

    it("keeps a degraded skip truthful — degraded only on a real true", () => {
        const view = parsePreviewVerification({
            status: "skipped",
            degraded: true,
            reason: "browser engine unavailable",
            checks: [],
        });
        expect(view.status).toBe("skipped");
        expect(view.degraded).toBe(true);
        expect(view.reason).toBe("browser engine unavailable");
        expect(parsePreviewVerification({ ...FULL_PREVIEW_VERIFICATION, degraded: "yes" }).degraded).toBe(false);
    });

    it("degrades partial/garbage payloads to neutral empties — never throws, never a pass", () => {
        for (const raw of [{}, null, "garbage", 42, { checks: "nope", status: 7, degraded: 1, reason: null }]) {
            const view = parsePreviewVerification(raw);
            expect(view.status).toBe("");
            expect(view.checks).toEqual([]);
            expect(view.degraded).toBe(false);
            expect(view.reason).toBeUndefined();
            expect(view.screenshotNote).toBe("screenshot not retained");
        }
    });

    it("drops malformed check rows but keeps the well-formed ones", () => {
        const view = parsePreviewVerification({
            checks: [null, "junk", { status: "passed" }, { tool: "" }, { tool: "browser_open", status: "passed" }],
        });
        expect(view.checks).toEqual([{ name: "browser_open", status: "passed" }]);
    });
});

describe("fetchPreviewVerification — envelope unwrap + the two truthful 404s", () => {
    afterEach(() => vi.restoreAllMocks());

    it("unwraps { data: { verification } } on 200", async () => {
        mockFetchOnce({ success: true, data: { verification: FULL_PREVIEW_VERIFICATION } });
        const result = await fetchPreviewVerification("ws1");
        expect(result.ok).toBe(true);
        expect(result.ok && result.view.status).toBe("failed");
        expect(result.ok && result.view.checks.length).toBe(3);
        expect(result.ok && result.view.screenshotNote).toBe("screenshot not retained");
    });

    it("maps a 404 'preview not verified' to not-verified — a truthful gap, not an error", async () => {
        mockFetchOnce({ success: false, error: { message: "preview not verified" } }, 404);
        const result = await fetchPreviewVerification("ws_plain");
        expect(result).toEqual({ ok: false, reason: "not-verified" });
    });

    it("maps a 404 'workspace not found' to workspace-missing", async () => {
        mockFetchOnce({ success: false, error: { message: "workspace not found" } }, 404);
        const result = await fetchPreviewVerification("ws_gone");
        expect(result).toEqual({ ok: false, reason: "workspace-missing" });
    });

    it("maps a rejected fetch to unreachable — never a fabricated verdict", async () => {
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
        const result = await fetchPreviewVerification("ws1");
        expect(result).toEqual({ ok: false, reason: "unreachable" });
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
