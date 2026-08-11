// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import { RecoderAgentsView } from "./recoder-agents";

// Truthful liveness a registered agent can report. Mirrors the backend
// heartbeat-SLO verdict (interop AgentStatus up/degraded/down/unknown) — never a
// fabricated `online`. An agent with no proof of life is `unknown`, not `online`.
type RecoderAgentLiveness = "online" | "stale" | "offline" | "unknown";

// One registered A2A agent projected from GET /api/interop/agents
// (interop AgentRow { id, kind, card:{ name, capabilities[] }, status }); only the
// fields the terminal renders. Liveness is DERIVED from the backend's own
// heartbeat-reconciled `status`, so it is truthful by construction (a fresh
// registration is `unknown` until a real heartbeat proves it). A row without a
// real id is DROPPED rather than shown as a fabricated "" agent.
type RecoderAgent = {
    id: string;
    name: string;
    capabilities: string[];
    liveness: RecoderAgentLiveness;
};

// Truthful line when the edge returns zero registered agents — the calm, honest
// state for the roster surface (no A2A agent has registered with this node yet).
const EmptyNotice = "No agents registered";

// Truthful line for a raw transport failure (cold backend on loopback :3100).
const NotConnected = "Not connected.";

class RecoderAgentsViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    agentsAtom: PrimitiveAtom<RecoderAgent[]>;
    errorAtom: PrimitiveAtom<string>;
    noticeAtom: PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean>;
    connectedAtom: PrimitiveAtom<boolean>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-agents";
        this.viewIcon = atom("users");
        this.viewName = atom("Agents");
        this.agentsAtom = atom([]) as PrimitiveAtom<RecoderAgent[]>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.noticeAtom = atom("") as PrimitiveAtom<string>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
    }

    get viewComponent(): ViewComponent {
        return RecoderAgentsView;
    }

    // A2A roster + liveness: GET /api/interop/agents → { agents: AgentRow[] }.
    // Degrade truthful — empty renders "No agents registered", a non-2xx surfaces
    // the backend reason verbatim, and a transport failure renders "Not
    // connected.". No branch EVER fabricates an agent row or an `online` status.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/interop/agents`);
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.agentsAtom, []);
                globalStore.set(this.noticeAtom, "");
                globalStore.set(this.errorAtom, readErrorReason(body) || `Agent roster unavailable (${res.status})`);
                globalStore.set(this.connectedAtom, false);
                RecoderConnectionModel.getInstance().noteRefresh(false);
                return;
            }
            const agents = projectAgents(body);
            globalStore.set(this.agentsAtom, agents);
            globalStore.set(this.noticeAtom, agents.length === 0 ? EmptyNotice : "");
            globalStore.set(this.errorAtom, "");
            globalStore.set(this.connectedAtom, true);
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch {
            globalStore.set(this.agentsAtom, []);
            globalStore.set(this.noticeAtom, "");
            globalStore.set(this.errorAtom, NotConnected);
            globalStore.set(this.connectedAtom, false);
            RecoderConnectionModel.getInstance().noteRefresh(false);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }
}

// Project the sendSuccess envelope's `data.agents` into terminal rows, sorted by
// name (then id) so the roster reads stably across refreshes. Entries without a
// real id are dropped rather than shown as a fabricated "" agent.
function projectAgents(body: unknown): RecoderAgent[] {
    const data = body != null && typeof body === "object" ? (body as { data?: unknown }).data : null;
    const raw = data != null && typeof data === "object" ? (data as { agents?: unknown }).agents : null;
    if (!Array.isArray(raw)) {
        return [];
    }
    const out: RecoderAgent[] = [];
    for (const item of raw) {
        const agent = projectAgent(item);
        if (agent != null) {
            out.push(agent);
        }
    }
    out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return out;
}

function projectAgent(value: unknown): RecoderAgent | null {
    const p = value != null && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const id = readString(p.id);
    if (id === "") {
        return null;
    }
    const card = p.card != null && typeof p.card === "object" ? (p.card as Record<string, unknown>) : {};
    const name = readString(card.name) || id;
    return {
        id,
        name,
        capabilities: readCapabilities(card.capabilities),
        liveness: toLiveness(p.status),
    };
}

// Map the backend heartbeat-SLO verdict onto the roster's liveness vocabulary.
// Anything the backend has NOT proven alive (unknown / missing / unrecognized)
// stays `unknown` — the roster never upgrades an unproven agent to `online`.
function toLiveness(status: unknown): RecoderAgentLiveness {
    if (status === "up") {
        return "online";
    }
    if (status === "degraded") {
        return "stale";
    }
    if (status === "down") {
        return "offline";
    }
    return "unknown";
}

function readCapabilities(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: string[] = [];
    for (const cap of value) {
        const s = readString(cap);
        if (s !== "") {
            out.push(s);
        }
    }
    return out;
}

function readString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export { RecoderAgentsViewModel, type RecoderAgent, type RecoderAgentLiveness };
