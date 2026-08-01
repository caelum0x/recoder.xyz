// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

// Consumes GET /api/conductor/transcript/search (the recoder-8d06 gap): search
// local Claude session transcripts by message content from the command palette.
// The fetch returns an honest three-way union — 'unavailable' (the backend
// truthfully has no sessions dir to search) is distinct from 'error' (transport
// or non-2xx), so the palette can show the missing source instead of faking an
// empty result. The projection and command mapping are pure data tables in the
// recoder-nav-commands style, so all of it is unit-testable without a view.

import type { RecoderCommand } from "./recoder-command-palette";
import { getRecoderBackendUrl } from "./recoder-endpoints";

// Structural mirror of the backend TranscriptSearchView (session-transcript
// .service.ts). The response is untrusted external data, so every field is
// optional and read defensively.
type TranscriptHitLike = {
    sessionId?: string;
    role?: string;
    snippet?: string;
    timestamp?: string;
};

type TranscriptSearchViewLike = {
    available?: boolean;
    reason?: string;
    query?: string;
    hits?: readonly TranscriptHitLike[];
    filesScanned?: number;
};

type TranscriptSearchResult =
    | { state: "loaded"; view: TranscriptSearchViewLike }
    | { state: "unavailable"; reason: string }
    | { state: "error"; message: string };

type TranscriptSessionRow = { sessionId: string; hitCount: number; snippets: string[] };

type TranscriptSearchProjection = { rows: TranscriptSessionRow[]; notices: string[] };

type TranscriptFetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

// Mirror the backend's scan/hit caps (MAX_FILES / MAX_HITS) so the truthful
// "capped" notices fire exactly when the backend hit its bound, never below.
const MaxScannedFiles = 200;
const MaxHits = 100;
const MaxSnippetLength = 80;

function transcriptSearchUrl(baseUrl: string, query: string): string {
    return `${baseUrl}/api/conductor/transcript/search?q=${encodeURIComponent(query)}`;
}

// Degrade-truthful and never throws: available:false is the backend's honest
// "nothing to search" (not a failure), while transport errors / non-2xx / a
// malformed envelope are 'error' — the palette must not conflate the two.
async function fetchTranscriptSearch(
    query: string,
    fetchImpl: TranscriptFetchLike = fetch
): Promise<TranscriptSearchResult> {
    try {
        const res = await fetchImpl(transcriptSearchUrl(getRecoderBackendUrl(), query));
        if (!res.ok) {
            return { state: "error", message: `transcript search failed (${res.status})` };
        }
        const body = (await res.json().catch(() => null)) as { data?: TranscriptSearchViewLike } | null;
        const view = body?.data;
        if (view == null || typeof view != "object") {
            return { state: "error", message: "malformed transcript search response" };
        }
        if (view.available === false) {
            return { state: "unavailable", reason: view.reason || "no session transcripts found" };
        }
        return { state: "loaded", view };
    } catch (e) {
        return { state: "error", message: e instanceof Error ? e.message : String(e) };
    }
}

function clipSnippet(snippet: string): string {
    const flat = snippet.replace(/\s+/g, " ").trim();
    if (flat.length <= MaxSnippetLength) {
        return flat;
    }
    return `${flat.slice(0, MaxSnippetLength - 1)}…`;
}

// Fold a loaded view into palette rows (one per session, hits grouped in
// first-seen order) plus the truthful cap/unavailable notices.
function projectTranscriptSearch(view: TranscriptSearchViewLike): TranscriptSearchProjection {
    if (view.available === false) {
        return {
            rows: [],
            notices: [`Session search unavailable — ${view.reason || "no session transcripts found"}`],
        };
    }
    const hits = Array.isArray(view.hits) ? view.hits : [];
    const bySession = new Map<string, TranscriptSessionRow>();
    for (const hit of hits) {
        const sessionId = typeof hit?.sessionId == "string" ? hit.sessionId : "";
        if (sessionId == "") {
            continue;
        }
        const snippet = clipSnippet(typeof hit.snippet == "string" ? hit.snippet : "");
        const row = bySession.get(sessionId);
        if (row == null) {
            bySession.set(sessionId, { sessionId, hitCount: 1, snippets: snippet == "" ? [] : [snippet] });
            continue;
        }
        row.hitCount += 1;
        if (snippet != "") {
            row.snippets.push(snippet);
        }
    }
    const notices: string[] = [];
    if (view.filesScanned === MaxScannedFiles) {
        notices.push(`scanned first ${MaxScannedFiles} session files`);
    }
    if (hits.length === MaxHits) {
        notices.push(`showing first ${MaxHits} matches`);
    }
    return { rows: [...bySession.values()], notices };
}

// The whole-result projection the palette wiring uses: every branch of the
// fetch union folds to rows + notices, each failure mode kept distinct.
function projectTranscriptSearchResult(result: TranscriptSearchResult): TranscriptSearchProjection {
    if (result.state == "error") {
        return { rows: [], notices: [`Session search failed — ${result.message}`] };
    }
    if (result.state == "unavailable") {
        return { rows: [], notices: [`Session search unavailable — ${result.reason}`] };
    }
    return projectTranscriptSearch(result.view);
}

// Session ids are uuids; clip for the visible title, keep the full id in
// keywords so the palette still finds the row by the complete id.
function shortSessionId(sessionId: string): string {
    return sessionId.length > 8 ? sessionId.slice(0, 8) : sessionId;
}

// Map a projection to the palette's RecoderCommand shape. Notices become
// non-actionable rows after the session rows so caps and unavailability stay
// visible in the exact surface the results render in.
function transcriptCommands(
    projection: TranscriptSearchProjection,
    onOpen: (sessionId: string) => void
): RecoderCommand[] {
    const list: RecoderCommand[] = projection.rows.map((row) => ({
        id: `transcript:${row.sessionId}`,
        title: `Session ${shortSessionId(row.sessionId)} — ${row.hitCount} ${row.hitCount == 1 ? "match" : "matches"}`,
        keywords: [row.sessionId, ...row.snippets].join(" "),
        run: () => onOpen(row.sessionId),
    }));
    projection.notices.forEach((notice, index) => {
        list.push({ id: `transcript-notice:${index}`, title: notice, run: () => {} });
    });
    return list;
}

export {
    fetchTranscriptSearch,
    projectTranscriptSearch,
    projectTranscriptSearchResult,
    transcriptCommands,
    transcriptSearchUrl,
    type TranscriptFetchLike,
    type TranscriptHitLike,
    type TranscriptSearchProjection,
    type TranscriptSearchResult,
    type TranscriptSearchViewLike,
    type TranscriptSessionRow,
};
