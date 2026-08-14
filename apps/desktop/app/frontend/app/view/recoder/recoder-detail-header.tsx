// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { cn } from "@/util/util";
import type { ReactNode } from "react";
import { PAGE_TITLE } from "./recoder-styles";
import { DEFAULT_PROJECT_ID } from "./recoder-board-logic";

// One workspace-detail has three faces the operator moves between: the live
// Session (recoder-terminal), the Review diff (recoder-diff), and the raw
// Terminal (a tmux attach). Session and Review are the two Recoder blocks that
// host THIS header; "terminal" is the raw tmux escape hatch, never an active
// face of this header. Sharing one header across Session and Review is what makes
// the two read as ONE workspace-detail instead of loose, disconnected blocks.
type RecoderDetailViewId = "session" | "review" | "terminal";
type RecoderDetailFace = "session" | "review";

type RecoderStateTone = "accent" | "neutral" | "error";
type RecoderStateChip = { label: string; tone: RecoderStateTone };

// The shared left side: the workspace's identity, sourced by each block from
// whatever it truthfully knows (Review holds the full record; Session resolves it
// from the same list edge). Absent fields simply don't render — never faked.
type RecoderDetailIdentity = {
    branch: string;
    repo?: string;
    agent?: string;
    stateChip?: RecoderStateChip;
};

function detailRepoLabel(repo?: string): string | null {
    const value = repo?.trim();
    return value != null && value != "" && value != DEFAULT_PROJECT_ID ? value : null;
}

type RecoderDetailOption = { id: string; label: string };
type RecoderDetailSwitcher = {
    options: RecoderDetailOption[];
    selectedId: string;
    onSelect: (id: string) => void;
};

type RecoderDetailSegmentVM = {
    id: RecoderDetailViewId;
    label: string;
    active: boolean;
    enabled: boolean;
};

// Pure: the consistent option label both Session and Review render for a
// workspace, so the switcher reads identically no matter which face opened it.
function workspaceOptionLabel(branch: string, state: string): string {
    const b = branch.trim() != "" ? branch.trim() : "(workspace)";
    return state.trim() != "" ? `${b} · ${state.trim()}` : b;
}

// Pure: a one-entry switcher is still worth showing so the frame is identical
// across faces; an empty list hides it (nothing to switch to — never a fake row).
function shouldShowSwitcher(options: RecoderDetailOption[]): boolean {
    return options.length >= 1;
}

// Pure segment/active/navigation decision (the unit under test). The current face
// is marked active and is NOT navigable to itself; the other face is navigable
// only when a real workspace is bound — nav NEVER fabricates a workspace that
// isn't there; the raw Terminal is navigable only when the caller can resolve the
// live tmux session (canOpenTerminal), else it degrades to a disabled affordance.
function detailSegments(
    current: RecoderDetailFace,
    hasWorkspace: boolean,
    canOpenTerminal: boolean
): RecoderDetailSegmentVM[] {
    return [
        {
            id: "session",
            label: "Session",
            active: current == "session",
            enabled: current != "session" && hasWorkspace,
        },
        {
            id: "review",
            label: "Review",
            active: current == "review",
            enabled: current != "review" && hasWorkspace,
        },
        {
            id: "terminal",
            label: "Terminal",
            active: false,
            enabled: hasWorkspace && canOpenTerminal,
        },
    ];
}

// Pure: the hover title for a segment states exactly why it is (un)available, so a
// disabled segment reads as a truthful "missing source", not dead chrome.
function segmentTitle(seg: RecoderDetailSegmentVM): string {
    if (seg.active) {
        return `${seg.label} — current view`;
    }
    if (!seg.enabled) {
        return seg.id == "terminal"
            ? "Live terminal unavailable — no attached tmux session"
            : "No workspace bound yet";
    }
    if (seg.id == "terminal") {
        return "Open the raw tmux terminal for this workspace";
    }
    return `Open ${seg.label} for this workspace`;
}

function stateChipClass(tone: RecoderStateTone): string {
    // Graphite-only palette: a real positive → the one accent, a failure → the one
    // reserved crimson, everything else stays neutral secondary.
    if (tone == "accent") {
        return "bg-accent/20 text-accent";
    }
    if (tone == "error") {
        return "bg-error/20 text-error";
    }
    return "border border-white/8 text-secondary";
}

const SEG_WRAP = "flex items-center rounded border border-white/8 overflow-hidden";
const SEG_BASE = "px-2 py-0.5 text-xs recoder-transition focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-white/50";
const SEG_ACTIVE = "bg-accent/20 text-accent cursor-default";
const SEG_ENABLED = "text-secondary hover:text-primary hover:bg-border/40 cursor-pointer";
const SEG_DISABLED = "text-secondary/40 cursor-default";

type RecoderDetailHeaderProps = {
    workspaceId: string;
    view: RecoderDetailFace;
    identity: RecoderDetailIdentity;
    switcher?: RecoderDetailSwitcher;
    onNavigate: (target: RecoderDetailFace) => void;
    onOpenTerminal?: () => void;
    primaryAction?: ReactNode;
};

// The one quiet header row shared by Session and Review: workspace identity on
// the left, then the workspace switcher + the Session·Review·Terminal segments +
// the per-screen ONE primary action on the right. Terminal-plain — one accent for
// the active segment, no chrome pile-up.
function RecoderDetailHeader({
    workspaceId,
    view,
    identity,
    switcher,
    onNavigate,
    onOpenTerminal,
    primaryAction,
}: RecoderDetailHeaderProps) {
    const hasWorkspace = workspaceId.trim() != "";
    const segments = detailSegments(view, hasWorkspace, onOpenTerminal != null);
    const showSwitcher = switcher != null && shouldShowSwitcher(switcher.options);
    const branchLabel = identity.branch.trim() != "" ? identity.branch : hasWorkspace ? workspaceId : "No workspace";
    const repoLabel = detailRepoLabel(identity.repo);

    const onSegment = (seg: RecoderDetailSegmentVM) => {
        if (!seg.enabled) {
            return;
        }
        if (seg.id == "terminal") {
            onOpenTerminal?.();
            return;
        }
        onNavigate(seg.id);
    };

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0">
            {repoLabel != null && (
                <span className="text-xs text-secondary truncate shrink-0" title={repoLabel}>
                    {repoLabel}
                </span>
            )}
            <span className={cn(PAGE_TITLE, "truncate")} title={hasWorkspace ? workspaceId : undefined}>
                {branchLabel}
            </span>
            {identity.agent != null && identity.agent != "" && (
                <span className="text-xs text-secondary truncate shrink-0" title={identity.agent}>
                    {identity.agent}
                </span>
            )}
            {identity.stateChip != null && (
                <span
                    className={cn(
                        "rounded px-1.5 py-0.5 text-xs whitespace-nowrap shrink-0",
                        stateChipClass(identity.stateChip.tone)
                    )}
                >
                    {identity.stateChip.label}
                </span>
            )}
            <div className="ml-auto flex items-center gap-2 shrink-0">
                {showSwitcher && (
                    <select
                        className="bg-panel text-primary border border-border rounded px-2 py-0.5 text-sm cursor-pointer max-w-[16rem]"
                        value={switcher.selectedId}
                        onChange={(e) => switcher.onSelect(e.target.value)}
                        title="Switch workspace"
                    >
                        {switcher.options.map((o) => (
                            <option key={o.id} value={o.id}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                )}
                <div className={SEG_WRAP} role="tablist" aria-label="Workspace detail views">
                    {segments.map((seg) => (
                        <button
                            key={seg.id}
                            role="tab"
                            aria-selected={seg.active}
                            disabled={!seg.active && !seg.enabled}
                            className={cn(SEG_BASE, seg.active ? SEG_ACTIVE : seg.enabled ? SEG_ENABLED : SEG_DISABLED)}
                            title={segmentTitle(seg)}
                            onClick={() => onSegment(seg)}
                        >
                            {seg.label}
                        </button>
                    ))}
                </div>
                {primaryAction}
            </div>
        </div>
    );
}

RecoderDetailHeader.displayName = "RecoderDetailHeader";

export {
    detailSegments,
    detailRepoLabel,
    RecoderDetailHeader,
    segmentTitle,
    shouldShowSwitcher,
    workspaceOptionLabel,
    type RecoderDetailFace,
    type RecoderDetailHeaderProps,
    type RecoderDetailIdentity,
    type RecoderDetailOption,
    type RecoderDetailSegmentVM,
    type RecoderDetailSwitcher,
    type RecoderDetailViewId,
    type RecoderStateChip,
    type RecoderStateTone,
};
