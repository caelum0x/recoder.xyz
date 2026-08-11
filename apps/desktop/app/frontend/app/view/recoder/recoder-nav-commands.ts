// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import type { RecoderCommand } from "./recoder-command-palette";

// The Recoder surfaces reachable from ⌘P as first-class blocks. Each maps a human
// title to the block `view` meta the launcher rail and board already use, so
// "Open X" opens the exact same view a rail widget would. Kept as a pure data
// table (no React, no store) so the palette wiring is unit-testable in isolation.
type RecoderNavTarget = { id: string; title: string; view: string };

// recoder-board (the bd-issue list) is intentionally NOT here: it names an engine
// to users and collides with the "Board" mental model — off-product per the audit.
const RecoderNavTargets: RecoderNavTarget[] = [
    { id: "nav-runs", title: "Open Runs", view: "recoder-runs" },
    { id: "nav-memory", title: "Open Memory", view: "recoder-memory" },
    { id: "nav-codebase", title: "Ask the Repo", view: "recoder-codebase" },
    { id: "nav-knowledge", title: "Teach the Repo", view: "recoder-ingest" },
    { id: "nav-collaboration", title: "Agent Collaboration", view: "recoder-siblings" },
    { id: "nav-tools", title: "Agent Tools", view: "recoder-capabilities" },
    { id: "nav-settings", title: "Open Settings", view: "recoder-settings" },
];

// Build the palette navigation commands from the target table. `openView` is the
// caller's createBlock/openBlock path, so the run handler stays a thin closure
// over the pinned view meta and this module never touches the block store.
function navigationCommands(openView: (view: string) => void): RecoderCommand[] {
    return RecoderNavTargets.map((t) => ({ id: t.id, title: t.title, run: () => openView(t.view) }));
}

export { navigationCommands, RecoderNavTargets, type RecoderNavTarget };
