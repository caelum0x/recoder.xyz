// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { RecoderEmpty, RecoderErrorRow, RecoderSkeleton } from "@/app/view/recoder/recoder-states";
import { META, PAGE_TITLE, ROW_TITLE, STATE_CHIP } from "@/app/view/recoder/recoder-styles";
import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import { RecoderLock, RecoderLocksViewModel } from "./recoder-locks-model";

const REFRESH_MS = 6000;

// Live lease line for a lock. A missing/invalid expiry is stated honestly rather
// than rendered as a fabricated countdown; an already-past lease reads "expired"
// (a crashed holder's stale lock is reclaimed on the next acquire).
function leaseLabel(expiresAt: string, nowMs: number): string {
    if (expiresAt === "") {
        return "no expiry";
    }
    const when = Date.parse(expiresAt);
    if (Number.isNaN(when)) {
        return "expiry unknown";
    }
    const remaining = when - nowMs;
    if (remaining <= 0) {
        return "expired";
    }
    const mins = Math.floor(remaining / 60000);
    if (mins < 60) {
        return `${mins}m left`;
    }
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m left`;
}

function LockRow({ lock, nowMs }: { lock: RecoderLock; nowMs: number }) {
    return (
        <div className="flex flex-col gap-1 rounded border border-border p-2" title={lock.id}>
            <div className="flex items-center gap-2">
                <span className={`${ROW_TITLE} font-mono truncate`}>{lock.path}</span>
                <span className={`${STATE_CHIP} ml-auto`}>{lock.mode}</span>
            </div>
            <div className="flex items-center gap-2">
                <span className={META}>held by {lock.holder}</span>
                {lock.taskId != null && lock.taskId != "" && <span className={META}>· task {lock.taskId}</span>}
                <span className={`${META} ml-auto`}>{leaseLabel(lock.expiresAt, nowMs)}</span>
            </div>
        </div>
    );
}

function RecoderLocksView({ model }: ViewComponentProps<RecoderLocksViewModel>) {
    const locks = useAtomValue(model.locksAtom);
    const error = useAtomValue(model.errorAtom);
    const notice = useAtomValue(model.noticeAtom);
    const loading = useAtomValue(model.loadingAtom);
    const connected = useAtomValue(model.connectedAtom);
    const [nowMs, setNowMs] = useState(Date.now());

    useEffect(() => {
        model.refresh();
        const id = setInterval(() => {
            model.refresh();
            setNowMs(Date.now());
        }, REFRESH_MS);
        return () => clearInterval(id);
    }, [model]);

    const showSkeleton = loading && locks.length == 0 && error == "" && notice == "";
    const showDisconnected = !connected && !loading && error == "";

    return (
        <div className="flex flex-col h-full overflow-auto p-3 gap-2">
            <div className="flex items-center gap-2">
                <span className={PAGE_TITLE}>Work Locks</span>
                {locks.length > 0 && <span className={`${STATE_CHIP} ml-auto`}>{locks.length} active</span>}
            </div>
            <RecoderErrorRow message={error} />
            {showSkeleton && <RecoderSkeleton rows={3} />}
            {showDisconnected && (
                <RecoderEmpty title="Recoder is still starting…" hint="Work locks load once it is ready." />
            )}
            {notice != "" && (
                <RecoderEmpty
                    title={notice}
                    hint="No parallel run is holding write scope on a shared path."
                />
            )}
            {locks.map((lock) => (
                <LockRow key={lock.id} lock={lock} nowMs={nowMs} />
            ))}
        </div>
    );
}

RecoderLocksView.displayName = "RecoderLocksView";

export { RecoderLocksView };
