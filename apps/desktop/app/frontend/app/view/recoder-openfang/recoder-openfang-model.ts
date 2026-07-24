// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { RecoderOpenfangView } from "./recoder-openfang";

// Everything here reads/writes the openfang kernel compiled INTO the backend
// (NAPI, in-process) via /api/agents/openfang/* — no daemon, no HTTP proxy.

type EngineHealth = {
    agents: number;
    activeHands: number;
    buildMode: string;
};

type Agent = {
    id: string;
    name: string;
    state: string;
};

// engine-down = native addon not built (503); not-available = the openfang HTTP edge
// is not mounted on this backend (404); down = backend unreachable.
type EngineStatus = "loading" | "ok" | "engine-down" | "not-available" | "down";

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v != null && !Array.isArray(v);
}

function firstString(...vals: unknown[]): string {
    for (const v of vals) {
        if (typeof v === "string" && v.trim() != "") return v.trim();
    }
    return "";
}

function normalizeAgents(raw: unknown): Agent[] {
    const list = isRecord(raw) && Array.isArray(raw.agents) ? raw.agents : [];
    return list
        .map((a) => {
            if (!isRecord(a)) return { id: "", name: "", state: "" };
            return {
                id: firstString(a.id, a.agent_id),
                name: firstString(a.name, a.id),
                state: firstString(a.state, a.status) || "unknown",
            };
        })
        .filter((a) => a.id != "");
}

class RecoderOpenfangViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    statusAtom: PrimitiveAtom<EngineStatus>;
    healthAtom: PrimitiveAtom<EngineHealth | null>;
    agentsAtom: PrimitiveAtom<Agent[]>;
    modelCountAtom: PrimitiveAtom<number>;
    skillsAtom: PrimitiveAtom<string[]>;
    usageAtom: PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean>;
    actionStatusAtom: PrimitiveAtom<string>;
    // Which agent's chat input is open, and its current text.
    chatAgentAtom: PrimitiveAtom<string>;
    chatInputAtom: PrimitiveAtom<string>;
    chatReplyAtom: PrimitiveAtom<string>;
    chatBusyAtom: PrimitiveAtom<boolean>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-openfang";
        this.viewIcon = atom("robot");
        this.viewName = atom("Engine");
        this.statusAtom = atom("loading") as PrimitiveAtom<EngineStatus>;
        this.healthAtom = atom(null) as PrimitiveAtom<EngineHealth | null>;
        this.agentsAtom = atom([]) as PrimitiveAtom<Agent[]>;
        this.modelCountAtom = atom(0) as PrimitiveAtom<number>;
        this.skillsAtom = atom([]) as PrimitiveAtom<string[]>;
        this.usageAtom = atom("") as PrimitiveAtom<string>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.actionStatusAtom = atom("") as PrimitiveAtom<string>;
        this.chatAgentAtom = atom("") as PrimitiveAtom<string>;
        this.chatInputAtom = atom("") as PrimitiveAtom<string>;
        this.chatReplyAtom = atom("") as PrimitiveAtom<string>;
        this.chatBusyAtom = atom(false) as PrimitiveAtom<boolean>;
    }

    get viewComponent(): ViewComponent {
        return RecoderOpenfangView;
    }

    private base(): string {
        return `${getRecoderBackendUrl()}/api/agents/openfang`;
    }

    async refresh() {
        globalStore.set(this.loadingAtom, true);
        globalStore.set(this.statusAtom, "loading");
        try {
            const res = await fetch(`${this.base()}/health`);
            if (res.status == 503) {
                this.clear();
                globalStore.set(this.statusAtom, "engine-down");
                return;
            }
            if (res.status == 404) {
                this.clear();
                globalStore.set(this.statusAtom, "not-available");
                return;
            }
            if (!res.ok) {
                this.clear();
                globalStore.set(this.statusAtom, "down");
                return;
            }
            const body = await res.json();
            // /health reports mode: native_addon vs subprocess vs unavailable.
            if (isRecord(body) && (body.status == "unavailable" || body.mode == "unavailable")) {
                this.clear();
                globalStore.set(this.statusAtom, "engine-down");
                return;
            }
            globalStore.set(this.statusAtom, "ok");
            await Promise.all([this.loadAgents(), this.loadInventory()]);
        } catch {
            this.clear();
            globalStore.set(this.statusAtom, "down");
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }

    private clear() {
        globalStore.set(this.healthAtom, null);
        globalStore.set(this.agentsAtom, []);
        globalStore.set(this.modelCountAtom, 0);
        globalStore.set(this.skillsAtom, []);
        globalStore.set(this.usageAtom, "");
    }

    // Agents list also carries the live health counters (engine boots on first read).
    private async loadAgents() {
        try {
            const res = await fetch(`${this.base()}/agents`);
            if (!res.ok) {
                globalStore.set(this.agentsAtom, []);
                return;
            }
            globalStore.set(this.agentsAtom, normalizeAgents(await res.json()));
        } catch {
            globalStore.set(this.agentsAtom, []);
        }
        // Health counters come from the same booted engine.
        try {
            const h = await (await fetch(`${this.base()}/health`)).json();
            if (isRecord(h) && typeof h.agents == "number") {
                globalStore.set(this.healthAtom, {
                    agents: h.agents,
                    activeHands: typeof h.active_hands == "number" ? h.active_hands : 0,
                    buildMode: firstString(h.build_mode) || "native",
                });
            }
        } catch {
            /* health is best-effort */
        }
    }

    private async loadInventory() {
        try {
            const models = await (await fetch(`${this.base()}/models`)).json();
            const arr = isRecord(models) && Array.isArray(models.models) ? models.models : [];
            globalStore.set(this.modelCountAtom, arr.length);
        } catch {
            globalStore.set(this.modelCountAtom, 0);
        }
        try {
            const skills = await (await fetch(`${this.base()}/skills`)).json();
            const arr = isRecord(skills) && Array.isArray(skills.skills) ? skills.skills.map((s: unknown) => String(s)) : [];
            globalStore.set(this.skillsAtom, arr);
        } catch {
            globalStore.set(this.skillsAtom, []);
        }
        try {
            const usage = await (await fetch(`${this.base()}/usage`)).json();
            globalStore.set(this.usageAtom, JSON.stringify(usage?.usage ?? usage ?? {}));
        } catch {
            globalStore.set(this.usageAtom, "");
        }
    }

    async activateAgent(id: string) {
        await this.agentAction(id, "activate", "Activated");
    }
    async stopAgent(id: string) {
        await this.agentAction(id, "stop", "Stopped");
    }
    async killAgent(id: string) {
        await this.agentAction(id, "kill", "Killed");
    }
    async resetAgent(id: string) {
        await this.agentAction(id, "reset", "Reset");
    }

    private async agentAction(id: string, verb: string, okLabel: string) {
        globalStore.set(this.actionStatusAtom, "");
        try {
            const res = await fetch(`${this.base()}/agents/${encodeURIComponent(id)}/${verb}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
            });
            if (!res.ok) {
                globalStore.set(this.actionStatusAtom, `${verb} failed (${res.status}).`);
                return;
            }
            const body = await res.json().catch(() => ({}));
            if (isRecord(body) && body.ok === false) {
                globalStore.set(this.actionStatusAtom, firstString(body.error) || `${verb} rejected.`);
                return;
            }
            globalStore.set(this.actionStatusAtom, `${okLabel} ${id}.`);
            await this.refresh();
        } catch {
            globalStore.set(this.actionStatusAtom, `${verb} unavailable — backend not reachable.`);
        }
    }

    setChatInput(value: string) {
        globalStore.set(this.chatInputAtom, value);
    }

    openChat(id: string) {
        globalStore.set(this.chatAgentAtom, id);
        globalStore.set(this.chatInputAtom, "");
        globalStore.set(this.chatReplyAtom, "");
    }

    closeChat() {
        globalStore.set(this.chatAgentAtom, "");
    }

    // Run one real agent-loop turn in-process. This makes an actual LLM call, so it
    // can take a while and needs the agent's provider key configured in openfang.
    async sendMessage() {
        const id = globalStore.get(this.chatAgentAtom);
        const message = globalStore.get(this.chatInputAtom).trim();
        if (id == "" || message == "") return;
        globalStore.set(this.chatBusyAtom, true);
        globalStore.set(this.chatReplyAtom, "");
        try {
            const res = await fetch(`${this.base()}/agents/${encodeURIComponent(id)}/message`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok || (isRecord(body) && body.ok === false)) {
                globalStore.set(this.chatReplyAtom, firstString(isRecord(body) ? body.error : "") || `Failed (${res.status}).`);
                return;
            }
            globalStore.set(this.chatReplyAtom, firstString(isRecord(body) ? body.response : "") || "(no response)");
        } catch {
            globalStore.set(this.chatReplyAtom, "Unavailable — backend not reachable.");
        } finally {
            globalStore.set(this.chatBusyAtom, false);
        }
    }
}

export { RecoderOpenfangViewModel, type Agent, type EngineHealth, type EngineStatus };
