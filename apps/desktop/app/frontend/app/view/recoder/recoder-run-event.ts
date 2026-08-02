// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure classification of a backend RunEvent into a structured display descriptor.
// The legacy run view flattens every event to one text line; a rich run view
// renders the descriptor as a block (icon + severity + label + detail). Keeping
// this pure and view-free makes it unit-testable and lets both renderers share
// one source of truth for how an event is described.

// Structural mirror — the socket payload is untrusted external data, so every
// field is optional and this never couples to a backend package.
type RunEventLike = {
    type?: string;
    message?: string;
    state?: string;
    artifactId?: string;
    createdAt?: string;
    data?: Record<string, unknown>;
};

type RunEventSeverity = "info" | "active" | "success" | "warn" | "danger";

// Who the event is really about: "run" = the conductor/agent run itself;
// "sandbox" = a cloud sandbox lifecycle transition the backend bridge
// (backend/src/bootstrap/cloud-seams.ts toAgentOsRunEvent) folds onto the same
// RunEvent board as a type:"log" frame stamped data.source:"cloud". Surfacing
// the origin keeps the label truthful instead of mixing sandbox frames into the
// run stream as generic logs.
type RunEventOrigin = "run" | "sandbox";

interface RunEventDescriptor {
    time: string;
    kind: string;
    label: string;
    icon: string;
    severity: RunEventSeverity;
    detail: string;
    origin: RunEventOrigin;
    // Present on an approval_requested event that carries a decidable approval —
    // lets the rich run view render inline approve/deny in place of the side-list.
    approvalId?: string;
}

type RunEventStyle = {
    label: string;
    icon: string;
    severity: RunEventSeverity;
};

// Keyed by the RunEventType values from packages/agent-os domain/event.ts.
const RunEventStyles: Record<string, RunEventStyle> = {
    started: { label: "Started", icon: "play", severity: "active" },
    state_transition: { label: "State", icon: "arrow-right-arrow-left", severity: "info" },
    log: { label: "Log", icon: "angle-right", severity: "info" },
    user_message: { label: "You", icon: "user", severity: "info" },
    artifact: { label: "Artifact", icon: "file", severity: "info" },
    needs_input: { label: "Needs input", icon: "keyboard", severity: "warn" },
    verified: { label: "Verified", icon: "circle-check", severity: "success" },
    approval_requested: { label: "Needs approval", icon: "shield-halved", severity: "warn" },
    handoff: { label: "Handoff", icon: "share-nodes", severity: "info" },
    failed: { label: "Failed", icon: "circle-xmark", severity: "danger" },
    completed: { label: "Completed", icon: "circle-check", severity: "success" },
};

const UnknownStyle: RunEventStyle = { label: "Event", icon: "circle", severity: "info" };

// Keyed by the CloudRunEvent lifecycle types the bridge stamps on data.cloudEventType.
const SandboxEventStyles: Record<string, RunEventStyle> = {
    "sandbox.provisioning": { label: "Sandbox provisioning", icon: "cloud", severity: "active" },
    "sandbox.running": { label: "Sandbox running", icon: "cloud", severity: "success" },
    "sandbox.error": { label: "Sandbox error", icon: "cloud", severity: "danger" },
    "sandbox.destroyed": { label: "Sandbox destroyed", icon: "cloud", severity: "info" },
    "sandbox.reaped": { label: "Sandbox reaped", icon: "cloud", severity: "info" },
};

const SandboxUnknownStyle: RunEventStyle = { label: "Sandbox", icon: "cloud", severity: "info" };

// The bridge's sandbox lifecycle type (data.cloudEventType) when the event is a
// cloud-sandbox frame (data.source == "cloud"), else null. A cloud frame with a
// missing/blank lifecycle type returns "" so it still lands in the sandbox lane
// (with the unknown style) instead of masquerading as a run log.
function sandboxEventType(event: RunEventLike): string | null {
    const data = event?.data;
    if (data == null || data.source != "cloud") return null;
    const cloudType = data.cloudEventType;
    return typeof cloudType == "string" ? cloudType : "";
}

function formatEventTime(iso?: string): string {
    if (iso == null || iso == "") return "--:--:--";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "--:--:--";
    return d.toTimeString().slice(0, 8);
}

function eventDetail(event: RunEventLike): string {
    if (typeof event.message == "string" && event.message != "") return event.message;
    if (typeof event.state == "string" && event.state != "") return `→ ${event.state}`;
    if (typeof event.artifactId == "string" && event.artifactId != "") return `artifact ${event.artifactId}`;
    return "";
}

// True once the run reached a terminal state — a rich view can stop the spinner.
function isTerminalRunEvent(event: RunEventLike): boolean {
    return event?.type == "completed" || event?.type == "failed";
}

// The decidable approval id an approval_requested event carries (backend emits it
// on data.approvalId; data.id tolerated). Absent ⇒ nothing to act on inline.
function extractApprovalId(event: RunEventLike): string | null {
    const data = event?.data;
    if (data == null) return null;
    for (const key of ["approvalId", "id"]) {
        const value = data[key];
        if (typeof value == "string" && value != "") return value;
    }
    return null;
}

function describeRunEvent(event: RunEventLike): RunEventDescriptor {
    const kind = typeof event.type == "string" && event.type != "" ? event.type : "event";
    const sandboxType = sandboxEventType(event);
    const style =
        sandboxType != null ? (SandboxEventStyles[sandboxType] ?? SandboxUnknownStyle) : (RunEventStyles[kind] ?? UnknownStyle);
    const descriptor: RunEventDescriptor = {
        time: formatEventTime(event.createdAt),
        kind,
        label: style.label,
        icon: style.icon,
        severity: style.severity,
        detail: eventDetail(event),
        origin: sandboxType != null ? "sandbox" : "run",
    };
    if (kind == "approval_requested") {
        const approvalId = extractApprovalId(event);
        if (approvalId != null) descriptor.approvalId = approvalId;
    }
    return descriptor;
}

// Reproduce the legacy single-line text form from the structured descriptor so the
// plain scrollback renderer and the rich renderer stay in lockstep. A sandbox
// frame heads with "sandbox" (its wire type is always "log", which would hide it).
function formatRunEventLine(descriptor: RunEventDescriptor): string {
    const head = `[${descriptor.time}] ${descriptor.origin == "sandbox" ? "sandbox" : descriptor.kind}`;
    return descriptor.detail != "" ? `${head}  ${descriptor.detail}` : head;
}

export {
    describeRunEvent,
    extractApprovalId,
    formatRunEventLine,
    isTerminalRunEvent,
    type RunEventDescriptor,
    type RunEventLike,
    type RunEventOrigin,
    type RunEventSeverity,
};
