// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { FIELD_LABEL, META, PAGE_TITLE, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { RecoderAuditViewModel, type AuditRecordView, type ChainVerdict } from "./recoder-audit-model";

const REFRESH_MS = 6000;
const HASH_PREFIX_LENGTH = 12;

function hashPrefix(hash: string): string {
    return hash == "" ? "—" : hash.slice(0, HASH_PREFIX_LENGTH);
}

// The single trust banner over the whole chain. Every branch is a truthful state:
// a tampered chain names the exact seq, an unverifiable environment says so, and a
// verified chain never over-claims (it also flags a partial/filtered view).
function VerificationBanner({ verdict, tamperSeq, contiguous, count }: {
    verdict: ChainVerdict;
    tamperSeq: number;
    contiguous: boolean;
    count: number;
}) {
    if (verdict == "empty") {
        return null;
    }
    if (verdict == "tampered") {
        return (
            <div className="rounded border border-error/40 bg-error/10 px-2 py-1 text-sm text-error">
                Tamper detected at seq {tamperSeq} — this record's sealed hash does not recompute.
            </div>
        );
    }
    if (verdict == "unverifiable") {
        return (
            <div className={`${STATE_CHIP} w-fit`}>
                Chain verification unavailable in this environment (no WebCrypto).
            </div>
        );
    }
    const partial = contiguous ? "" : " · partial workspace view";
    return (
        <div className="rounded border border-success/40 bg-success/10 px-2 py-1 text-sm text-success">
            Entry integrity verified — {count} {count == 1 ? "record" : "records"} recomputed in-browser{partial}.
        </div>
    );
}

function AuditRow({ record }: { record: AuditRecordView }) {
    return (
        <div className="flex flex-col gap-0.5 rounded border border-border p-2">
            <div className="flex items-center gap-2">
                <span className={`${STATE_CHIP} font-mono`}>#{record.seq}</span>
                <span className="text-sm font-medium">{record.action == "" ? "(unknown action)" : record.action}</span>
                {record.effect != "" && <span className={STATE_CHIP}>{record.effect}</span>}
                {record.riskTier != "" && <span className={STATE_CHIP}>{record.riskTier}</span>}
                {record.degraded && <span className={STATE_CHIP}>degraded</span>}
                <span className={`ml-auto text-xs ${record.verified ? "text-success" : "text-error"}`}>
                    {record.verified ? "verified" : "unverified"}
                </span>
            </div>
            <div className="text-secondary text-xs">
                {record.actorId == "" ? "(unknown actor)" : record.actorId}
                {record.createdAt != "" && <span className="ml-2 font-mono">{record.createdAt}</span>}
            </div>
            <div className="text-meta text-xs font-mono break-all">
                entry {hashPrefix(record.entryHash)} · prev {hashPrefix(record.prevHash)}
                {!record.linked && <span className="ml-2">· prev links outside this view</span>}
            </div>
        </div>
    );
}

function RecoderAuditView({ model }: ViewComponentProps<RecoderAuditViewModel>) {
    const workspaceId = useAtomValue(model.workspaceIdAtom);
    const records = useAtomValue(model.recordsAtom);
    const verdict = useAtomValue(model.verdictAtom);
    const tamperSeq = useAtomValue(model.tamperSeqAtom);
    const contiguous = useAtomValue(model.contiguousAtom);
    const notice = useAtomValue(model.noticeAtom);
    const error = useAtomValue(model.errorAtom);
    const loading = useAtomValue(model.loadingAtom);
    const connected = useAtomValue(model.connectedAtom);

    useEffect(() => {
        if (workspaceId == "") {
            return;
        }
        model.load(workspaceId);
        const id = setInterval(() => model.load(workspaceId), REFRESH_MS);
        return () => clearInterval(id);
    }, [model, workspaceId]);

    const showDisconnected = !connected && error == "" && !loading && records.length == 0 && notice == "";

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Audit</span>
                <span className={META}>Per-entry integrity re-checked in your browser</span>
            </div>
            <RecoderErrorRow message={error} />
            <VerificationBanner verdict={verdict} tamperSeq={tamperSeq} contiguous={contiguous} count={records.length} />
            {loading && records.length == 0 && notice == "" && <RecoderSkeleton rows={3} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="The audit trail loads once it is ready." />
            )}
            {records.length > 0 && (
                <div className="flex flex-col gap-1">
                    <div className={FIELD_LABEL}>Records</div>
                    {records.map((record) => (
                        <AuditRow key={`${record.seq}:${record.id}`} record={record} />
                    ))}
                </div>
            )}
            {records.length == 0 && notice != "" && (
                <RecoderEmpty
                    title={notice}
                    hint="Every governed control-plane event (advance / pr / merge / stop) seals into a hash-chained Merkle trail; entries show up here and are re-verified in your browser."
                />
            )}
        </div>
    );
}

RecoderAuditView.displayName = "RecoderAuditView";

export { RecoderAuditView };
