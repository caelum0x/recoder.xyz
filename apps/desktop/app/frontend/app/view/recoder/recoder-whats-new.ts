// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure logic for the in-app "what's new after update" surface — the post-update
// notes Cursor users complain are missing. Given the changelog, the version the
// user last acknowledged, and the current app version, it returns the entries to
// show (newer than last-seen, up to current). Nothing here touches the DOM,
// localStorage, or the electron version — those are wired by the component.

type WhatsNewEntry = {
    version: string;
    title: string;
    notes: string[];
};

// Parse a semver-ish "1.2.3" (extra pre-release/build suffixes ignored) into a
// numeric tuple. Non-numeric parts degrade to 0 so a malformed version never
// throws — it just sorts low.
function parseVersion(version: string): [number, number, number] {
    const core = (version ?? "").trim().replace(/^v/i, "").split(/[-+]/)[0];
    const parts = core.split(".").map((p) => {
        const n = Number(p);
        return Number.isFinite(n) ? n : 0;
    });
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

// Compare two versions: <0 when a<b, 0 when equal, >0 when a>b (major→minor→patch).
function compareVersions(a: string, b: string): number {
    const pa = parseVersion(a);
    const pb = parseVersion(b);
    for (let i = 0; i < 3; i++) {
        if (pa[i] != pb[i]) {
            return pa[i] - pb[i];
        }
    }
    return 0;
}

// Pure: the changelog entries to show after an update — those with version in
// (lastSeen, current], newest first. Rules that keep it non-annoying:
//  - a FIRST run (lastSeen empty) shows NOTHING: we don't pop notes at a fresh
//    install, only on a genuine upgrade;
//  - entries newer than `current` (a downgrade or a pre-release changelog) are
//    excluded — we never show notes for a version the user isn't running;
//  - an entry equal to lastSeen is already acknowledged, so it's excluded.
function selectWhatsNew(
    entries: readonly WhatsNewEntry[],
    lastSeen: string,
    current: string
): WhatsNewEntry[] {
    const seen = (lastSeen ?? "").trim();
    if (seen == "") {
        return [];
    }
    return entries
        .filter((e) => compareVersions(e.version, seen) > 0 && compareVersions(e.version, current) <= 0)
        .sort((a, b) => compareVersions(b.version, a.version));
}

export { compareVersions, parseVersion, selectWhatsNew, type WhatsNewEntry };
