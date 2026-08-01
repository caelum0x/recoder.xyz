// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Pure projection + fetch helper for the TRUE line-level A/B pairwise diff
// (GET /api/conductor/workspaces/compare/:taskGroup/pairwise?a=&b=), the backend
// edge the PairwisePanel renders. Everything here is jotai-free; the fetch seam
// is injectable so tests stub it. Degrade-safe throughout: an unrecognized
// payload, a non-2xx, or an unreachable backend yields a truthful { ok:false }
// with the backend's verbatim reason — the panel then keeps its client-side
// delta fallback, never a fabricated diff.

import { getRecoderBackendUrl } from "./recoder-endpoints";
import { readErrorReason } from "./recoder-errors";

// One file's projected row. `lines` is the unified patch split into lines
// (trailing blank dropped); [] for an identical, binary, or unavailable file.
type PairwiseFileRow = {
    path: string;
    available: boolean;
    binary: boolean;
    lines: string[];
    // "" when available — the truthful reason otherwise (bad path, no worktree,
    // one-sided file, git fault), verbatim from the backend.
    unavailableReason: string;
};

type PairwiseView = {
    a: string;
    b: string;
    files: PairwiseFileRow[];
    capped: boolean;
};

// Plain optional fields (not a discriminated union): this app compiles with
// strictNullChecks off, so union narrowing on `ok` would not typecheck.
type PairwiseFetchResult = { ok: boolean; view?: PairwiseView; error?: string };

type PairwiseLineKind = "add" | "del" | "hunk" | "meta" | "ctx";

function asObject(value: unknown): Record<string, unknown> {
    if (value == null || typeof value != "object" || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

function patchLines(patch: string): string[] {
    if (patch == "") {
        return [];
    }
    const lines = patch.split("\n");
    if (lines.length > 0 && lines[lines.length - 1] == "") {
        lines.pop();
    }
    return lines;
}

function projectPairwiseFile(value: unknown): PairwiseFileRow {
    const d = asObject(value);
    if (d == null || typeof d.path != "string" || d.path == "") {
        return null;
    }
    const available = d.available === true;
    const binary = d.binary === true;
    const patch = typeof d.patch == "string" ? d.patch : "";
    return {
        path: d.path,
        available,
        binary,
        lines: available && !binary ? patchLines(patch) : [],
        unavailableReason: available ? "" : typeof d.reason == "string" ? d.reason : "diff unavailable",
    };
}

// Lenient narrow of the backend PairwiseDiffView. `a`/`b` and a files array are
// required (else null — the caller reports an unrecognized response); individual
// file entries missing a path are skipped, never fabricated.
function parsePairwiseView(data: unknown): PairwiseView {
    const d = asObject(data);
    if (d == null || typeof d.a != "string" || typeof d.b != "string" || !Array.isArray(d.files)) {
        return null;
    }
    const files: PairwiseFileRow[] = [];
    for (const entry of d.files) {
        const row = projectPairwiseFile(entry);
        if (row != null) {
            files.push(row);
        }
    }
    return { a: d.a, b: d.b, files, capped: d.capped === true };
}

// Classify a unified-diff line. File headers ("+++"/"---"/"diff "/"index ") are
// matched before the generic +/- so they read as neutral metadata (the same
// discipline as the Review diff's diffLineKind).
function pairwiseLineKind(line: string): PairwiseLineKind {
    if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("+++") || line.startsWith("---")) {
        return "meta";
    }
    if (line.startsWith("@@")) {
        return "hunk";
    }
    if (line.startsWith("+")) {
        return "add";
    }
    if (line.startsWith("-")) {
        return "del";
    }
    return "ctx";
}

// GET the line-level pairwise diff for one picked A/B pair. `paths` optional —
// absent, the backend defaults to the pair's shared changed files. Degrade-safe:
// never throws; a 404 (foreign/unknown pair) surfaces the backend's reason.
async function fetchPairwiseDiff(
    taskGroup: string,
    a: string,
    b: string,
    paths?: string[],
    fetchImpl: typeof fetch = fetch
): Promise<PairwiseFetchResult> {
    const tg = (taskGroup ?? "").trim();
    const aId = (a ?? "").trim();
    const bId = (b ?? "").trim();
    if (tg == "" || aId == "" || bId == "") {
        return { ok: false, error: "No A/B pair selected." };
    }
    const query =
        `a=${encodeURIComponent(aId)}&b=${encodeURIComponent(bId)}` +
        (paths != null && paths.length > 0 ? `&paths=${encodeURIComponent(paths.join(","))}` : "");
    try {
        const res = await fetchImpl(
            `${getRecoderBackendUrl()}/api/conductor/workspaces/compare/${encodeURIComponent(tg)}/pairwise?${query}`
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
            return { ok: false, error: readErrorReason(body) || `Pairwise diff unavailable (HTTP ${res.status}).` };
        }
        // Backend envelope: `{ data: { pairwise: PairwiseDiffView } }` — unwrap
        // `.pairwise` (fall back to the envelope itself for tolerance).
        const envelope = asObject(asObject(body)?.data) ?? asObject(body) ?? {};
        const view = parsePairwiseView(envelope.pairwise ?? envelope);
        if (view == null) {
            return { ok: false, error: "Pairwise diff unavailable — unrecognized response." };
        }
        return { ok: true, view };
    } catch {
        return { ok: false, error: "Pairwise diff unavailable — Recoder isn’t reachable." };
    }
}

export {
    fetchPairwiseDiff,
    pairwiseLineKind,
    parsePairwiseView,
    type PairwiseFetchResult,
    type PairwiseFileRow,
    type PairwiseLineKind,
    type PairwiseView,
};
