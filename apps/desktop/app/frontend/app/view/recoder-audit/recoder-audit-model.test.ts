// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-audit", () => ({
    RecoderAuditView: () => null,
}));

import { globalStore } from "@/app/store/global";
import { RecoderAuditViewModel, verifyAuditChain, type AuditRecordView } from "./recoder-audit-model";

const WorkspaceId = "ws-1";
const AuditUrl = `http://127.0.0.1:3100/api/conductor/workspaces/${WorkspaceId}/audit`;
const Genesis = "0".repeat(64);

// The unsealed fields the gate records (backend types.ts AuditEntryInput).
type AuditEntry = {
    actorId: string;
    action: string;
    resource: string;
    effect: string;
    riskTier: string;
    degraded: boolean;
    payload: Record<string, unknown>;
};

// Independent re-implementation of the BACKEND seal (audit-chain.service.ts:25-26,
// 140-167) using node:crypto — so a chain built here that the model (WebCrypto)
// verifies true PROVES the model's serialization matches the backend byte-for-byte,
// not merely that it is self-consistent.
function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortKeys);
    }
    if (value != null && typeof value == "object") {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            out[key] = sortKeys((value as Record<string, unknown>)[key]);
        }
        return out;
    }
    return value;
}

function canonicalJson(value: unknown): string {
    return JSON.stringify(sortKeys(value));
}

function entryDigest(entry: AuditEntry): Record<string, unknown> {
    return {
        actorId: entry.actorId,
        action: entry.action,
        resource: entry.resource,
        effect: entry.effect,
        riskTier: entry.riskTier,
        degraded: entry.degraded,
        payload: entry.payload ?? {},
    };
}

function backendSeal(prevHash: string, entry: AuditEntry): string {
    return createHash("sha256").update(`${prevHash}|${canonicalJson(entryDigest(entry))}`).digest("hex");
}

// Build a valid genesis-anchored, contiguous audit chain of durable AuditRecords.
function buildChain(entries: AuditEntry[]): AuditRecordView[] {
    let prev = Genesis;
    return entries.map((entry, i) => {
        const entryHash = backendSeal(prev, entry);
        const record: AuditRecordView = {
            id: `aud-${i + 1}`,
            seq: i + 1,
            prevHash: prev,
            entryHash,
            actorId: entry.actorId,
            action: entry.action,
            resource: entry.resource,
            effect: entry.effect,
            riskTier: entry.riskTier,
            degraded: entry.degraded,
            payload: entry.payload,
            createdAt: `2026-08-11T10:0${i}:00.000Z`,
            verified: false,
            linked: false,
        };
        prev = entryHash;
        return record;
    });
}

function sampleEntries(): AuditEntry[] {
    return [
        {
            actorId: "user-1",
            action: "workspace.advance",
            resource: "conductor",
            effect: "allow",
            riskTier: "low",
            degraded: false,
            payload: { workspaceId: WorkspaceId, from: "planning", to: "running" },
        },
        {
            actorId: "user-1",
            action: "pr.create",
            resource: "conductor",
            effect: "needs_approval",
            riskTier: "high",
            degraded: false,
            payload: { workspaceId: WorkspaceId, branch: "feat/x" },
        },
        {
            actorId: "user-1",
            action: "workspace.merge",
            resource: "conductor",
            effect: "allow",
            riskTier: "medium",
            degraded: true,
            payload: { workspaceId: WorkspaceId, auditId: "aud-2" },
        },
    ];
}

function mockAuditFetch(audit: unknown) {
    return vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { audit } }),
    });
}

function makeModel(): RecoderAuditViewModel {
    return new RecoderAuditViewModel({ blockId: "b1" } as ViewModelInitType);
}

describe("verifyAuditChain", () => {
    it("verifies a real backend-sealed chain in-browser (WebCrypto matches node SHA-256)", async () => {
        const chain = buildChain(sampleEntries());
        const result = await verifyAuditChain(chain);

        expect(result.verdict).toBe("verified");
        expect(result.tamperSeq).toBe(-1);
        expect(result.contiguous).toBe(true);
        expect(result.records.every((r) => r.verified)).toBe(true);
    });

    it("flags the FIRST broken link at the tampered seq when a field is altered after sealing", async () => {
        const chain = buildChain(sampleEntries());
        // Tamper the middle record's action WITHOUT recomputing its entryHash.
        (chain[1] as { action: string }).action = "secret.rotate";

        const result = await verifyAuditChain(chain);

        expect(result.verdict).toBe("tampered");
        expect(result.tamperSeq).toBe(2);
        expect(result.records[0].verified).toBe(true);
        expect(result.records[1].verified).toBe(false);
        // The untouched trailing record still re-seals correctly on its own content.
        expect(result.records[2].verified).toBe(true);
    });

    it("reports an empty chain as its own truthful verdict, never verified", async () => {
        const result = await verifyAuditChain([]);
        expect(result.verdict).toBe("empty");
        expect(result.records).toEqual([]);
    });
});

describe("RecoderAuditViewModel.load", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("loads a workspace audit trail and reports a verified chain", async () => {
        const chain = buildChain(sampleEntries());
        const fetchMock = mockAuditFetch(chain);
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.load(WorkspaceId);

        expect(fetchMock).toHaveBeenCalledWith(AuditUrl);
        expect(globalStore.get(model.recordsAtom)).toHaveLength(3);
        expect(globalStore.get(model.verdictAtom)).toBe("verified");
        expect(globalStore.get(model.tamperSeqAtom)).toBe(-1);
        expect(globalStore.get(model.contiguousAtom)).toBe(true);
        expect(globalStore.get(model.errorAtom)).toBe("");
        expect(globalStore.get(model.noticeAtom)).toBe("");
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("surfaces a truthful tamper verdict at the broken seq, never a fake 'verified'", async () => {
        const chain = buildChain(sampleEntries());
        (chain[1] as { effect: string }).effect = "allow"; // was needs_approval
        vi.stubGlobal("fetch", mockAuditFetch(chain));

        const model = makeModel();
        await model.load(WorkspaceId);

        expect(globalStore.get(model.verdictAtom)).toBe("tampered");
        expect(globalStore.get(model.tamperSeqAtom)).toBe(2);
        expect(globalStore.get(model.recordsAtom)[1].verified).toBe(false);
    });

    it("shows the empty-trail notice and no rows when the workspace has no audit records", async () => {
        vi.stubGlobal("fetch", mockAuditFetch([]));

        const model = makeModel();
        await model.load(WorkspaceId);

        expect(globalStore.get(model.recordsAtom)).toEqual([]);
        expect(globalStore.get(model.verdictAtom)).toBe("empty");
        expect(globalStore.get(model.noticeAtom)).toBe("No audit records yet");
        expect(globalStore.get(model.connectedAtom)).toBe(true);
    });

    it("degrades truthfully with the backend reason on a non-2xx response", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 403,
                json: async () => ({ error: { message: "workspace access denied" } }),
            })
        );

        const model = makeModel();
        await model.load(WorkspaceId);

        expect(globalStore.get(model.recordsAtom)).toEqual([]);
        expect(globalStore.get(model.errorAtom)).toBe("workspace access denied");
        expect(globalStore.get(model.connectedAtom)).toBe(false);
    });

    it("degrades to 'Not connected.' and clears the trail on a transport failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const model = makeModel();
        globalStore.set(model.recordsAtom, [
            {
                id: "stale",
                seq: 1,
                prevHash: Genesis,
                entryHash: "x",
                actorId: "a",
                action: "b",
                resource: "conductor",
                effect: "allow",
                riskTier: "low",
                degraded: false,
                payload: {},
                createdAt: "2026-01-01T00:00:00.000Z",
                verified: true,
                linked: true,
            },
        ]);
        await model.load(WorkspaceId);

        expect(globalStore.get(model.errorAtom)).toBe("Not connected.");
        expect(globalStore.get(model.recordsAtom)).toEqual([]);
        expect(globalStore.get(model.connectedAtom)).toBe(false);
        expect(globalStore.get(model.loadingAtom)).toBe(false);
    });

    it("clears the trail and shows the empty verdict on an empty workspace id without a request", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const model = makeModel();
        await model.load("   ");

        expect(fetchMock).not.toHaveBeenCalled();
        expect(globalStore.get(model.recordsAtom)).toEqual([]);
        expect(globalStore.get(model.verdictAtom)).toBe("empty");
        expect(globalStore.get(model.connectedAtom)).toBe(false);
    });
});
