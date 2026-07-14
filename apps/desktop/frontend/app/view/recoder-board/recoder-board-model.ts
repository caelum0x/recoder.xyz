// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { RecoderBoardView } from "./recoder-board";

// A single ready-to-pick-up issue as rendered on the board. Only the fields the
// terminal shows are declared; everything else from the source is ignored.
type BoardIssue = {
    id: string;
    title: string;
    priority: string;
};

// A recorded work-signal: a stuck/blocked/needs-handoff workspace whose work was
// handed back to the conductor and is now pickup-able (GET /api/conductor/work-signals).
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
//   not-connected  — backend down / probe failed
type BoardStatus = "loading" | "ok" | "empty" | "unavailable" | "unreachable" | "not-connected";

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

    // Pickup-able stuck work (independent + degrade-safe): a stuck/blocked agent's
    // work handed back to the conductor. Any failure just leaves the section empty.
    async fetchSignals() {
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/work-signals?limit=20`);
            if (!res.ok) {
                globalStore.set(this.signalsAtom, []);
                return;
            }
            const body = await res.json();
            const list = Array.isArray(body?.data) ? body.data : [];
            const signals: BoardSignal[] = list
                .map((s: Record<string, unknown>) => ({
                    workspaceId: firstString(s?.workspaceId),
                    kind: firstString(s?.kind),
                    detail: firstString(s?.detail),
                    when: firstString(s?.recordedAt),
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

    // Two-stage, fully degrade-safe: first a cheap unauthenticated availability
    // probe (is `bd` installed?), then the governed ready-list call. Any failure at
    // any stage lands on a neutral status; this never throws or fakes data.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.statusAtom, "loading");
        // Pickup-able stuck work loads independently of the beads ready-list.
        void this.fetchSignals();
        try {
            const available = await this.probeAvailability();
            if (available == null) {
                globalStore.set(this.issuesAtom, []);
                globalStore.set(this.statusAtom, "not-connected");
                return;
            }
            if (!available) {
                globalStore.set(this.issuesAtom, []);
                globalStore.set(this.statusAtom, "unavailable");
                return;
            }
            const issues = await this.fetchReady();
            if (issues == null) {
                globalStore.set(this.issuesAtom, []);
                globalStore.set(this.statusAtom, "unreachable");
                return;
            }
            globalStore.set(this.issuesAtom, issues);
            globalStore.set(this.statusAtom, issues.length == 0 ? "empty" : "ok");
        } catch {
            globalStore.set(this.issuesAtom, []);
            globalStore.set(this.statusAtom, "not-connected");
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    // Returns true/false for bd presence, or null when the backend itself is
    // unreachable (so the UI can distinguish "no backend" from "no bd").
    async probeAvailability(): Promise<boolean | null> {
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/issues/availability`);
            if (!res.ok) {
                return null;
            }
            const body = await res.json();
            return Boolean(body?.data?.available);
        } catch {
            return null;
        }
    }

    // Ready work via the loopback-friendly conductor endpoint (read-only, no gate,
    // no internal key). Returns the list on success (possibly empty), or null when
    // the backend is unreachable.
    async fetchReady(): Promise<BoardIssue[] | null> {
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/conductor/issues/ready`);
            if (!res.ok) {
                return null;
            }
            const body = await res.json();
            return normalizeIssues(body?.data?.ready);
        } catch {
            return null;
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
