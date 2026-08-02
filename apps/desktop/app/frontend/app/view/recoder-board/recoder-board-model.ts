// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { RecoderBoardView } from "./recoder-board";

// A single ready-to-pick-up issue as rendered on the board. Only the fields the
// terminal shows are declared; everything else from the source is ignored.
type BoardIssue = {
    id: string;
    title: string;
    priority: string;
};

// A recorded work-signal: a stuck/blocked/needs-you run surfaced by the
// observability domain and now pickup-able (GET /api/agent-os/observability/signals).
type BoardSignal = {
    workspaceId: string;
    kind: string;
    detail: string;
    when: string;
};

// Neutral, degrade-safe states. The component maps each to a plain message and
// never fabricates a success:
//   loading        — a probe is in flight
//   ok             — issues present
//   empty          — bd reachable, nothing ready
//   unavailable    — bd CLI not installed on this machine
//   unreachable    — bd present but the governed ready bridge refused us (no key)
//   not-available  — the ready-issue route is not mounted on this backend (404)
//   not-connected  — backend down / probe failed
type BoardStatus =
    | "loading"
    | "ok"
    | "empty"
    | "unavailable"
    | "unreachable"
    | "not-available"
    | "not-connected";

class RecoderBoardViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    issuesAtom: PrimitiveAtom<BoardIssue[]>;
    loadingAtom: PrimitiveAtom<boolean>;
    statusAtom: PrimitiveAtom<BoardStatus>;
    signalsAtom: PrimitiveAtom<BoardSignal[]>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-board";
        this.viewIcon = atom("clipboard-list");
        this.viewName = atom("Board");
        this.issuesAtom = atom([]) as PrimitiveAtom<BoardIssue[]>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.statusAtom = atom("loading") as PrimitiveAtom<BoardStatus>;
        this.signalsAtom = atom([]) as PrimitiveAtom<BoardSignal[]>;
    }

    // Pickup-able stuck work (independent + degrade-safe): a stuck/blocked/needs-you
    // run surfaced by the observability work-signals feed. Any failure just leaves
    // the section empty. The signal shape is the domain WorkSignal
    // {id, kind, title, reason, runId, detectedAt, ...}; the board only renders a
    // correlated run id, a kind, a one-line detail, and a timestamp.
    async fetchSignals() {
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/observability/signals`);
            if (!res.ok) {
                globalStore.set(this.signalsAtom, []);
                return;
            }
            const body = await res.json();
            const list = Array.isArray(body?.data?.signals) ? body.data.signals : [];
            const signals: BoardSignal[] = list
                .map((s: Record<string, unknown>) => ({
                    workspaceId: firstString(s?.runId),
                    kind: firstString(s?.kind),
                    detail: firstString(s?.title, s?.reason),
                    when: firstString(s?.detectedAt),
                }))
                .filter((s: BoardSignal) => s.kind != "");
            globalStore.set(this.signalsAtom, signals);
        } catch {
            globalStore.set(this.signalsAtom, []);
        }
    }

    get viewComponent(): ViewComponent {
        return RecoderBoardView;
    }

    // Fully degrade-safe: read the ready-list route directly. A 404 means the route
    // is not mounted on this backend (truthful "not available", never faked); any
    // other non-OK is treated as an unreachable backend. Never throws or fakes data.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.statusAtom, "loading");
        // Pickup-able stuck work loads independently of the beads ready-list.
        void this.fetchSignals();
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/issues/ready`);
            if (res.status == 404) {
                globalStore.set(this.issuesAtom, []);
                globalStore.set(this.statusAtom, "not-available");
                // A 404 means the backend answered (route not mounted) — the
                // connection itself is live, only this feature is absent.
                RecoderConnectionModel.getInstance().noteRefresh(true);
                return;
            }
            if (!res.ok) {
                globalStore.set(this.issuesAtom, []);
                globalStore.set(this.statusAtom, "not-connected");
                RecoderConnectionModel.getInstance().noteRefresh(false);
                return;
            }
            const body = await res.json();
            const issues = normalizeIssues(body?.data?.ready);
            globalStore.set(this.issuesAtom, issues);
            globalStore.set(this.statusAtom, issues.length == 0 ? "empty" : "ok");
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch {
            globalStore.set(this.issuesAtom, []);
            globalStore.set(this.statusAtom, "not-connected");
            RecoderConnectionModel.getInstance().noteRefresh(false);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }
}

// Defensively pull an issue array out of whatever the MCP tool returned. Handles a
// bare array, an {issues:[...]} envelope, and the MCP {content:[{text}]} text form.
// Always returns an array (empty when the shape is unrecognized) — never throws.
function normalizeIssues(raw: unknown): BoardIssue[] {
    const list = coerceList(raw);
    return list.map(mapIssue).filter((issue) => issue.id != "" || issue.title != "");
}

function coerceList(raw: unknown): unknown[] {
    if (Array.isArray(raw)) {
        return raw;
    }
    if (!isRecord(raw)) {
        return [];
    }
    if (Array.isArray(raw.issues)) {
        return raw.issues;
    }
    if (Array.isArray(raw.items)) {
        return raw.items;
    }
    if (Array.isArray(raw.content)) {
        return parseContent(raw.content);
    }
    return [];
}

function parseContent(content: unknown[]): unknown[] {
    const out: unknown[] = [];
    for (const part of content) {
        if (!isRecord(part) || typeof part.text != "string") {
            continue;
        }
        try {
            const parsed = JSON.parse(part.text);
            if (Array.isArray(parsed)) {
                out.push(...parsed);
            } else if (isRecord(parsed) && Array.isArray(parsed.issues)) {
                out.push(...parsed.issues);
            }
        } catch {
            // Non-JSON text content is ignored rather than surfaced as a fake issue.
        }
    }
    return out;
}

function mapIssue(item: unknown): BoardIssue {
    if (!isRecord(item)) {
        return { id: "", title: "", priority: "" };
    }
    const id = firstString(item.taskId, item.id, item.issueId, item.ref, item.externalId);
    const title = firstString(item.title, item.goal, item.summary, item.name, item.description);
    return {
        id,
        title: title || id,
        priority: normalizePriority(item.priority ?? item.p),
    };
}

function firstString(...vals: unknown[]): string {
    for (const v of vals) {
        if (typeof v == "string" && v.trim() != "") {
            return v.trim();
        }
        if (typeof v == "number") {
            return String(v);
        }
    }
    return "";
}

function normalizePriority(value: unknown): string {
    if (typeof value == "number") {
        return `P${value}`;
    }
    if (typeof value == "string" && value.trim() != "") {
        return value.trim();
    }
    return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value == "object" && value != null && !Array.isArray(value);
}

export { RecoderBoardViewModel, type BoardIssue, type BoardStatus, type BoardSignal };
