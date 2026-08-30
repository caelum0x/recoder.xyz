// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { detailSegments, segmentTitle, type RecoderDetailFace, type RecoderDetailViewId } from "./recoder-detail-header";

// Pure state for the workspace-detail container (PRODUCT-GAPS PW3-9, paradigm =
// POP-OUT TABS: Session/Review swap in-place under one surface, but the live
// Terminal stays a Wave pop-out — it is never an in-container active
// face). The live pane swap is owned by `recoder-detail.tsx`; the pop-out wiring
// is owned by each face's shared header. THIS module owns the truthful navigation
// decision so every branch remains headless-testable like the sibling header.

interface DetailContainerState {
    readonly activeFace: RecoderDetailFace;
}

// The outcome of a tab click, resolved WITHOUT mutating state:
// - switch:          change the in-container active face (Session ⇄ Review).
// - popout-terminal: the caller should open the substrate-routed terminal as a separate
//                    (tiling) block — never folded into the container surface.
// - noop:            nothing to do, with a truthful reason (already current, no
//                    workspace bound, or no attached substrate session) — never a
//                    silent dead click.
type DetailNavOutcome =
    | { readonly kind: "switch"; readonly face: RecoderDetailFace }
    | { readonly kind: "popout-terminal" }
    | { readonly kind: "noop"; readonly reason: string };

// Decide what a tab click means, reusing the header's segment truth so the
// container and the header can never disagree about what is enabled. Navigation
// NEVER fabricates a face that isn't backed by a real workspace / tmux session.
function resolveDetailNav(
    state: DetailContainerState,
    target: RecoderDetailViewId,
    hasWorkspace: boolean,
    canOpenTerminal: boolean
): DetailNavOutcome {
    const seg = detailSegments(state.activeFace, hasWorkspace, canOpenTerminal).find((s) => s.id == target);
    if (seg == null) {
        return { kind: "noop", reason: "Unknown view" };
    }
    if (target == "terminal") {
        return seg.enabled ? { kind: "popout-terminal" } : { kind: "noop", reason: segmentTitle(seg) };
    }
    if (seg.active) {
        return { kind: "noop", reason: `${seg.label} — current view` };
    }
    if (!seg.enabled) {
        return { kind: "noop", reason: segmentTitle(seg) };
    }
    return { kind: "switch", face: target };
}

// Immutable reducer: a real switch yields a NEW state; any noop/pop-out returns
// the SAME reference so React skips a needless re-render.
function applyDetailNav(state: DetailContainerState, outcome: DetailNavOutcome): DetailContainerState {
    if (outcome.kind == "switch") {
        return { activeFace: outcome.face };
    }
    return state;
}

export { applyDetailNav, resolveDetailNav, type DetailContainerState, type DetailNavOutcome };
