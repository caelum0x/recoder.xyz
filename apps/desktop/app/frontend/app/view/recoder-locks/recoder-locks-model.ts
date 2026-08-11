// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import { RecoderLocksView } from "./recoder-locks";

// One active work lock projected from GET /api/agent-os/locks
// (governance WorkLock { id, resourcePath, holderAgentId, taskId?, mode,
// acquiredAt, expiresAt, releasedAt? }); only the fields the terminal renders —
// which agent holds which path, exclusive|shared, the bound task, and the live
// lease. A lock without a real path or holder is DROPPED rather than shown as a
// fabricated "" row.
type RecoderLock = {
    id: string;
    path: string;
    holder: string;
    mode: "exclusive" | "shared";
    expiresAt: string;
    taskId?: string;
};

// Truthful line when the edge returns zero active locks — the calm, honest state
// for the coordination surface (no parallel run is holding write scope).
const EmptyNotice = "No active work locks";

// Truthful line for a raw transport failure (cold backend on loopback :3100).
const NotConnected = "Not connected.";

class RecoderLocksViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    locksAtom: PrimitiveAtom<RecoderLock[]>;
    errorAtom: PrimitiveAtom<string>;
    noticeAtom: PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean>;
    connectedAtom: PrimitiveAtom<boolean>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-locks";
        this.viewIcon = atom("lock");
        this.viewName = atom("Work Locks");
        this.locksAtom = atom([]) as PrimitiveAtom<RecoderLock[]>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.noticeAtom = atom("") as PrimitiveAtom<string>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
    }

    get viewComponent(): ViewComponent {
        return RecoderLocksView;
    }

    // Active work locks: GET /api/agent-os/locks → { locks: WorkLock[] }. Degrade
    // truthful — empty renders "No active work locks", a non-2xx surfaces the
    // backend reason verbatim, and a transport failure renders "Not connected.".
    // No branch EVER fabricates a lock row.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/locks`);
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.locksAtom, []);
                globalStore.set(this.noticeAtom, "");
                globalStore.set(this.errorAtom, readErrorReason(body) || `Work locks unavailable (${res.status})`);
                globalStore.set(this.connectedAtom, false);
                RecoderConnectionModel.getInstance().noteRefresh(false);
                return;
            }
            const locks = projectLocks(body);
            globalStore.set(this.locksAtom, locks);
            globalStore.set(this.noticeAtom, locks.length === 0 ? EmptyNotice : "");
            globalStore.set(this.errorAtom, "");
            globalStore.set(this.connectedAtom, true);
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch {
            globalStore.set(this.locksAtom, []);
            globalStore.set(this.noticeAtom, "");
            globalStore.set(this.errorAtom, NotConnected);
            globalStore.set(this.connectedAtom, false);
            RecoderConnectionModel.getInstance().noteRefresh(false);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }
}

// Project the sendSuccess envelope's `data.locks` into terminal rows, sorted by
// path (then holder) so parallel-run contention on the same path reads together.
// Entries without a real path or holder are dropped rather than shown blank.
function projectLocks(body: unknown): RecoderLock[] {
    const data = body != null && typeof body === "object" ? (body as { data?: unknown }).data : null;
    const raw = data != null && typeof data === "object" ? (data as { locks?: unknown }).locks : null;
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: RecoderLock[] = [];
    for (const item of raw) {
        const lock = projectLock(item);
        if (lock != null) {
            out.push(lock);
        }
    }
    out.sort((a, b) => a.path.localeCompare(b.path) || a.holder.localeCompare(b.holder));
    return out;
}

function projectLock(value: unknown): RecoderLock | null {
    const p = value != null && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const path = readString(p.resourcePath);
    const holder = readString(p.holderAgentId);
    if (path === "" || holder === "") {
        return null;
    }
    const lock: RecoderLock = {
        id: readString(p.id) || `${holder}:${path}`,
        path,
        holder,
        mode: p.mode === "shared" ? "shared" : "exclusive",
        expiresAt: readString(p.expiresAt),
    };
    const taskId = readString(p.taskId);
    return taskId === "" ? lock : { ...lock, taskId };
}

function readString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export { RecoderLocksViewModel, type RecoderLock };
