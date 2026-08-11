// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import { RecoderAuditView } from "./recoder-audit";

// One durable, hash-chained governance AuditRecord projected for the timeline,
// PLUS the client-side verification outcome for that record. Mirrors the backend
// read model (governance/types.ts AuditRecord): the sealed control-plane events
// (merge/pr/advance/stop) whose payload carries this workspaceId. `payload` is
// retained (not just rendered) because it is one of the fields the entryHash seals.
type AuditRecordView = {
    id: string;
    seq: number;
    prevHash: string;
    entryHash: string;
    actorId: string;
    action: string;
    resource: string;
    effect: string;
    riskTier: string;
    degraded: boolean;
    payload: Record<string, unknown>;
    createdAt: string;
    // The client recomputed this record's entryHash and it matched (content intact).
    verified: boolean;
    // This record's prevHash links to the previous record's entryHash IN THIS SLICE.
    linked: boolean;
};

// The whole-chain verdict shown in the single banner. `unverifiable` is a truthful
// degrade for an environment with no WebCrypto — NEVER conflated with `verified`.
type ChainVerdict = "empty" | "verified" | "tampered" | "unverifiable";

type ChainVerification = {
    verdict: ChainVerdict;
    // The seq of the FIRST record whose entryHash did not recompute, or -1 when none.
    tamperSeq: number;
    // Whether every record links to its predecessor in the returned slice. The
    // per-workspace edge filters a GLOBAL chain by payload.workspaceId, so a false
    // here is a legitimate "partial view", NOT tampering (see verifyAuditChain).
    contiguous: boolean;
    records: AuditRecordView[];
};

// The fixed genesis tip the first durable audit entry chains from (backend
// governance/types.ts AUDIT_GENESIS_HASH = 64 hex zeros).
const AuditGenesisHash = "0".repeat(64);

// Truthful empty state: the workspace has sealed no control-plane events yet.
const EmptyTrailNotice = "No audit records yet";

// Raw transport failure (backend still starting / unreachable on loopback).
const NotConnectedNotice = "Not connected.";

class RecoderAuditViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    workspaceIdAtom: PrimitiveAtom<string>;
    recordsAtom: PrimitiveAtom<AuditRecordView[]>;
    verdictAtom: PrimitiveAtom<ChainVerdict>;
    tamperSeqAtom: PrimitiveAtom<number>;
    contiguousAtom: PrimitiveAtom<boolean>;
    noticeAtom: PrimitiveAtom<string>;
    errorAtom: PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean>;
    connectedAtom: PrimitiveAtom<boolean>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-audit";
        this.viewIcon = atom("shield-halved");
        this.viewName = atom("Audit");
        this.workspaceIdAtom = atom("") as PrimitiveAtom<string>;
        this.recordsAtom = atom([]) as PrimitiveAtom<AuditRecordView[]>;
        this.verdictAtom = atom("empty") as PrimitiveAtom<ChainVerdict>;
        this.tamperSeqAtom = atom(-1) as PrimitiveAtom<number>;
        this.contiguousAtom = atom(true) as PrimitiveAtom<boolean>;
        this.noticeAtom = atom("") as PrimitiveAtom<string>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
    }

    get viewComponent(): ViewComponent {
        return RecoderAuditView;
    }

    // GET the durable governance-audit trail for one workspace and RE-VERIFY the
    // hash chain in-browser: recompute each record's entryHash with WebCrypto and
    // compare it to the sealed value. Degrade-truthful: an empty trail shows a calm
    // notice, a non-2xx surfaces the backend reason, a transport throw shows
    // "Not connected.", and a recompute mismatch shows a "tamper detected at seq N"
    // verdict — none of them ever fabricates a record or a fake "verified".
    async load(workspaceId: string) {
        const id = (workspaceId ?? "").trim();
        globalStore.set(this.workspaceIdAtom, id);
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.errorAtom, "");
        if (id == "") {
            this.applyVerification({ verdict: "empty", tamperSeq: -1, contiguous: true, records: [] });
            globalStore.set(this.noticeAtom, EmptyTrailNotice);
            globalStore.set(this.connectedAtom, false);
            globalStore.set(this.loadingAtom, false);
            return;
        }
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/workspaces/${encodeURIComponent(id)}/audit`);
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                this.applyVerification({ verdict: "empty", tamperSeq: -1, contiguous: true, records: [] });
                globalStore.set(this.errorAtom, readErrorReason(body) || `Audit trail unavailable (${res.status})`);
                globalStore.set(this.noticeAtom, "");
                globalStore.set(this.connectedAtom, false);
                RecoderConnectionModel.getInstance().noteRefresh(false);
                return;
            }
            const raw = (body as { data?: { audit?: unknown } } | null)?.data?.audit;
            const verification = await verifyAuditChain(projectAuditRecords(raw));
            this.applyVerification(verification);
            globalStore.set(this.noticeAtom, verification.verdict == "empty" ? EmptyTrailNotice : "");
            globalStore.set(this.connectedAtom, true);
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch {
            this.applyVerification({ verdict: "empty", tamperSeq: -1, contiguous: true, records: [] });
            globalStore.set(this.errorAtom, NotConnectedNotice);
            globalStore.set(this.noticeAtom, "");
            globalStore.set(this.connectedAtom, false);
            RecoderConnectionModel.getInstance().noteRefresh(false);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    private applyVerification(v: ChainVerification) {
        globalStore.set(this.recordsAtom, v.records);
        globalStore.set(this.verdictAtom, v.verdict);
        globalStore.set(this.tamperSeqAtom, v.tamperSeq);
        globalStore.set(this.contiguousAtom, v.contiguous);
    }
}

// --- projection --------------------------------------------------------------

function asObject(value: unknown): Record<string, unknown> {
    return value != null && typeof value == "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringOr(value: unknown, fallback: string): string {
    return typeof value == "string" ? value : fallback;
}

// Project the wire audit array into typed records. Defensive: a non-array yields an
// empty trail; a record is kept verbatim (verification runs separately). `verified`
// / `linked` are seeded false and overwritten by verifyAuditChain.
function projectAuditRecords(value: unknown): AuditRecordView[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: AuditRecordView[] = [];
    for (const raw of value) {
        const r = asObject(raw);
        out.push({
            id: stringOr(r.id, ""),
            seq: typeof r.seq == "number" && Number.isFinite(r.seq) ? r.seq : 0,
            prevHash: stringOr(r.prevHash, ""),
            entryHash: stringOr(r.entryHash, ""),
            actorId: stringOr(r.actorId, ""),
            action: stringOr(r.action, ""),
            resource: stringOr(r.resource, ""),
            effect: stringOr(r.effect, ""),
            riskTier: stringOr(r.riskTier, ""),
            degraded: r.degraded === true,
            payload: asObject(r.payload),
            createdAt: stringOr(r.createdAt, ""),
            verified: false,
            linked: false,
        });
    }
    return out;
}

// --- in-browser chain verification ------------------------------------------

// The exact field subset the backend hashes (audit-chain.service.ts entryDigest).
// Order is irrelevant — canonicalJson key-sorts before serializing.
function entryDigestOf(record: AuditRecordView): Record<string, unknown> {
    return {
        actorId: record.actorId,
        action: record.action,
        resource: record.resource,
        effect: record.effect,
        riskTier: record.riskTier,
        degraded: record.degraded,
        payload: record.payload ?? {},
    };
}

// Stable, key-sorted JSON — byte-identical to the backend's canonicalJson so the
// recomputed hash matches across the Rust/Node writer and this WebCrypto verifier.
function canonicalJson(value: unknown): string {
    return JSON.stringify(sortKeys(value));
}

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

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToHex(bytes: Uint8Array): string {
    let hex = "";
    for (const b of bytes) {
        hex += b.toString(16).padStart(2, "0");
    }
    return hex;
}

// Recompute one entry seal exactly as the backend does:
//   entryHash = SHA-256hex(`${prevHash}|${canonicalJson(entryDigest)}`)
// Returns "" when WebCrypto is unavailable so the caller can degrade to
// "unverifiable" rather than falsely flag a tamper.
async function sealHex(prevHash: string, digest: Record<string, unknown>): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (subtle == null) {
        return "";
    }
    const input = `${prevHash}|${canonicalJson(digest)}`;
    const bytes = new TextEncoder().encode(input);
    const buf = await subtle.digest("SHA-256", bytesToArrayBuffer(bytes));
    return bytesToHex(new Uint8Array(buf));
}

// Re-verify the durable audit chain IN-BROWSER. For each record we recompute its
// entryHash from its OWN prevHash + sealed fields and compare — a mismatch is a
// genuine content tamper, flagged at the first offending seq. We ALSO record
// whether each record links to its predecessor in the returned slice.
//
// DELIBERATE, TRUTHFUL DEVIATION from a naive full-chain walk: the per-workspace
// edge (backend audit.repository.ts range → `payload->>'workspaceId'`) returns a
// FILTERED slice of the single GLOBAL Merkle chain, so a record's prevHash points
// at whatever entry preceded it GLOBALLY — often not the previous entry in this
// workspace's slice. A linkage gap is therefore a legitimate "partial view", NOT
// tampering, and must never raise a false alarm. The cryptographic tamper verdict
// is driven solely by the per-record entryHash recomputation (always valid on any
// slice); `contiguous` is exposed as informational context.
async function verifyAuditChain(records: AuditRecordView[]): Promise<ChainVerification> {
    if (records.length == 0) {
        return { verdict: "empty", tamperSeq: -1, contiguous: true, records: [] };
    }
    if (globalThis.crypto?.subtle == null) {
        const passthrough = records.map((r) => ({ ...r, verified: false, linked: false }));
        return { verdict: "unverifiable", tamperSeq: -1, contiguous: false, records: passthrough };
    }
    const sorted = [...records].sort((a, b) => a.seq - b.seq);
    const out: AuditRecordView[] = [];
    let tamperSeq = -1;
    let contiguous = true;
    let prevEntry = "";
    for (const record of sorted) {
        const expected = await sealHex(record.prevHash, entryDigestOf(record));
        const verified = expected != "" && record.entryHash != "" && expected === record.entryHash;
        const linked = prevEntry == "" ? true : record.prevHash === prevEntry;
        if (!linked) {
            contiguous = false;
        }
        if (!verified && tamperSeq == -1) {
            tamperSeq = record.seq;
        }
        out.push({ ...record, verified, linked });
        prevEntry = record.entryHash;
    }
    const verdict: ChainVerdict = tamperSeq == -1 ? "verified" : "tampered";
    return { verdict, tamperSeq, contiguous, records: out };
}

export {
    AuditGenesisHash,
    RecoderAuditViewModel,
    verifyAuditChain,
    type AuditRecordView,
    type ChainVerdict,
    type ChainVerification,
};
