// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { RecoderConnectionModel } from "../recoder/recoder-connection-model";
import { getRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { readErrorReason } from "../recoder/recoder-errors";
import { RecoderWorkflowsView } from "./recoder-workflows";

// One step projected from a @recoder/agent-workflows WorkflowNode
// ({ nodeId, kind, label, dependsOn?, config }); only the fields the terminal
// renders — the human label and the node kind that names the governed stage
// (verification / approval-wait / pull-request / deploy). A node with no real
// name is DROPPED rather than shown as a fabricated "" step.
type RecoderWorkflowNode = {
    name: string;
    kind: string;
};

// One governed pipeline projected from GET /api/agent-os/workflows
// (WorkflowDefinition { workflowId, name, version, nodes[], ... }); only the
// fields the terminal renders. nodeCount reflects the projected (real) steps so
// an unnamed node never inflates the count.
type RecoderWorkflow = {
    id: string;
    name: string;
    nodes: RecoderWorkflowNode[];
    nodeCount: number;
};

// Truthful line when the edge returns zero workflows — the honest empty state for
// the catalog (no governed pipeline has been defined on this machine).
const EmptyNotice = "No workflows defined";

// Truthful line for a raw transport failure (cold backend on loopback :3100).
const NotConnected = "Not connected.";

class RecoderWorkflowsViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    workflowsAtom: PrimitiveAtom<RecoderWorkflow[]>;
    dispatchConfiguredAtom: PrimitiveAtom<boolean>;
    errorAtom: PrimitiveAtom<string>;
    noticeAtom: PrimitiveAtom<string>;
    loadingAtom: PrimitiveAtom<boolean>;
    connectedAtom: PrimitiveAtom<boolean>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-workflows";
        this.viewIcon = atom("diagram-project");
        this.viewName = atom("Workflows");
        this.workflowsAtom = atom([]) as PrimitiveAtom<RecoderWorkflow[]>;
        this.dispatchConfiguredAtom = atom(false) as PrimitiveAtom<boolean>;
        this.errorAtom = atom("") as PrimitiveAtom<string>;
        this.noticeAtom = atom("") as PrimitiveAtom<string>;
        this.loadingAtom = atom(false) as PrimitiveAtom<boolean>;
        this.connectedAtom = atom(false) as PrimitiveAtom<boolean>;
    }

    get viewComponent(): ViewComponent {
        return RecoderWorkflowsView;
    }

    // Workflow catalog: GET /api/agent-os/workflows → { dispatchConfigured,
    // workflows: WorkflowDefinition[] }. Degrade truthful — empty renders "No
    // workflows defined", a non-2xx surfaces the backend reason verbatim, and a
    // transport failure renders "Not connected.". dispatchConfigured is surfaced
    // as-is so the chip never implies a run seam that isn't wired. No branch EVER
    // fabricates a workflow row.
    async refresh() {
        globalStore.set(this.loadingAtom, true);
        try {
            const res = await fetch(`${getRecoderBackendUrl()}/api/agent-os/workflows`);
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                globalStore.set(this.workflowsAtom, []);
                globalStore.set(this.dispatchConfiguredAtom, false);
                globalStore.set(this.noticeAtom, "");
                globalStore.set(this.errorAtom, readErrorReason(body) || `Workflows unavailable (${res.status})`);
                globalStore.set(this.connectedAtom, false);
                RecoderConnectionModel.getInstance().noteRefresh(false);
                return;
            }
            const projected = projectCatalog(body);
            globalStore.set(this.workflowsAtom, projected.workflows);
            globalStore.set(this.dispatchConfiguredAtom, projected.dispatchConfigured);
            globalStore.set(this.noticeAtom, projected.workflows.length === 0 ? EmptyNotice : "");
            globalStore.set(this.errorAtom, "");
            globalStore.set(this.connectedAtom, true);
            RecoderConnectionModel.getInstance().noteRefresh(true);
        } catch {
            globalStore.set(this.workflowsAtom, []);
            globalStore.set(this.dispatchConfiguredAtom, false);
            globalStore.set(this.noticeAtom, "");
            globalStore.set(this.errorAtom, NotConnected);
            globalStore.set(this.connectedAtom, false);
            RecoderConnectionModel.getInstance().noteRefresh(false);
        } finally {
            globalStore.set(this.loadingAtom, false);
        }
    }
}

type CatalogProjection = {
    dispatchConfigured: boolean;
    workflows: RecoderWorkflow[];
};

// Project the sendSuccess envelope's `data` into a truthful catalog. A workflow
// without a real identity (neither workflowId nor name) is dropped rather than
// shown blank; dispatchConfigured is read strictly as a boolean so an absent
// field degrades to "not configured" instead of a truthy accident.
function projectCatalog(body: unknown): CatalogProjection {
    const data = body != null && typeof body === "object" ? (body as { data?: unknown }).data : null;
    const record = data != null && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const dispatchConfigured = record.dispatchConfigured === true;
    const raw = record.workflows;
    if (!Array.isArray(raw)) {
        return { dispatchConfigured, workflows: [] };
    }
    const workflows: RecoderWorkflow[] = [];
    for (const item of raw) {
        const workflow = projectWorkflow(item);
        if (workflow != null) {
            workflows.push(workflow);
        }
    }
    return { dispatchConfigured, workflows };
}

function projectWorkflow(value: unknown): RecoderWorkflow | null {
    const w = value != null && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const id = readString(w.workflowId) || readString(w.name);
    if (id === "") {
        return null;
    }
    const nodes = projectNodes(w.nodes);
    return {
        id,
        name: readString(w.name) || id,
        nodes,
        nodeCount: nodes.length,
    };
}

function projectNodes(value: unknown): RecoderWorkflowNode[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const out: RecoderWorkflowNode[] = [];
    for (const item of value) {
        const n = item != null && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const name = readString(n.label) || readString(n.nodeId);
        if (name === "") {
            continue;
        }
        out.push({ name, kind: readString(n.kind) });
    }
    return out;
}

function readString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export { RecoderWorkflowsViewModel, type RecoderWorkflow, type RecoderWorkflowNode };
