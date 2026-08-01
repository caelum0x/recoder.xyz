// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
    fetchTranscriptSearch,
    projectTranscriptSearch,
    projectTranscriptSearchResult,
    transcriptCommands,
    transcriptSearchUrl,
    type TranscriptSearchViewLike,
} from "./recoder-transcript-search";

// Minimal fetch stub factory: records the requested URL and answers with the
// backend's sendSuccess envelope ({ success, data }) or a raw failure.
function fetchOk(data: unknown, urls: string[] = []) {
    return async (url: string) => {
        urls.push(url);
        return { ok: true, status: 200, json: async () => ({ success: true, data }) };
    };
}

function view(over: Partial<TranscriptSearchViewLike> = {}): TranscriptSearchViewLike {
    return { available: true, query: "auth", hits: [], filesScanned: 3, ...over };
}

function hit(sessionId: string, snippet = "some matching text") {
    return { sessionId, role: "user", snippet, timestamp: "2026-08-01T00:00:00Z" };
}

describe("fetchTranscriptSearch", () => {
    it("unwraps the sendSuccess envelope into a loaded view", async () => {
        const result = await fetchTranscriptSearch("auth", fetchOk(view({ hits: [hit("s1")] })));
        expect(result.state).toBe("loaded");
        if (result.state == "loaded") {
            expect(result.view.hits).toHaveLength(1);
        }
    });

    it("URL-encodes the query (space and &)", async () => {
        const urls: string[] = [];
        await fetchTranscriptSearch("fix auth & login", fetchOk(view(), urls));
        expect(urls).toHaveLength(1);
        expect(urls[0].endsWith("/api/conductor/transcript/search?q=fix%20auth%20%26%20login")).toBe(true);
    });

    it("maps available:false to 'unavailable' with the backend reason surfaced", async () => {
        const result = await fetchTranscriptSearch(
            "auth",
            fetchOk(view({ available: false, reason: "no Claude sessions directory found" }))
        );
        expect(result).toEqual({ state: "unavailable", reason: "no Claude sessions directory found" });
    });

    it("maps a non-2xx response to 'error', NOT 'unavailable'", async () => {
        const result = await fetchTranscriptSearch("auth", async () => ({
            ok: false,
            status: 503,
            json: async () => ({ success: false }),
        }));
        expect(result.state).toBe("error");
    });

    it("maps a thrown fetch (network down) to 'error', never throws", async () => {
        const result = await fetchTranscriptSearch("auth", async () => {
            throw new Error("connection refused");
        });
        expect(result).toEqual({ state: "error", message: "connection refused" });
    });

    it("maps a malformed envelope (no data object) to 'error'", async () => {
        const result = await fetchTranscriptSearch("auth", async () => ({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
        }));
        expect(result.state).toBe("error");
    });
});

describe("transcriptSearchUrl", () => {
    it("builds the conductor transcript search route off the base url", () => {
        expect(transcriptSearchUrl("http://127.0.0.1:3100", "abc")).toBe(
            "http://127.0.0.1:3100/api/conductor/transcript/search?q=abc"
        );
    });
});

describe("projectTranscriptSearch", () => {
    it("groups hits by sessionId preserving first-seen order, with per-session counts", () => {
        const projection = projectTranscriptSearch(
            view({ hits: [hit("s1", "alpha"), hit("s2", "beta"), hit("s1", "gamma")] })
        );
        expect(projection.rows.map((r) => r.sessionId)).toEqual(["s1", "s2"]);
        expect(projection.rows[0].hitCount).toBe(2);
        expect(projection.rows[0].snippets).toEqual(["alpha", "gamma"]);
        expect(projection.rows[1].hitCount).toBe(1);
        expect(projection.notices).toEqual([]);
    });

    it("truncates long snippets for a palette row", () => {
        const long = "x".repeat(300);
        const projection = projectTranscriptSearch(view({ hits: [hit("s1", long)] }));
        expect(projection.rows[0].snippets[0].length).toBeLessThanOrEqual(80);
        expect(projection.rows[0].snippets[0].endsWith("…")).toBe(true);
    });

    it("emits the unavailable notice with the reason", () => {
        const projection = projectTranscriptSearch(view({ available: false, reason: "no Claude sessions directory found" }));
        expect(projection.rows).toEqual([]);
        expect(projection.notices).toEqual(["Session search unavailable — no Claude sessions directory found"]);
    });

    it("fires the capped-scan notice at exactly 200 files and not below", () => {
        expect(projectTranscriptSearch(view({ filesScanned: 200 })).notices).toEqual([
            "scanned first 200 session files",
        ]);
        expect(projectTranscriptSearch(view({ filesScanned: 199 })).notices).toEqual([]);
    });

    it("fires the capped-hits notice at exactly 100 hits and not below", () => {
        const hits = (n: number) => Array.from({ length: n }, (_, i) => hit(`s${i}`));
        expect(projectTranscriptSearch(view({ hits: hits(100) })).notices).toEqual(["showing first 100 matches"]);
        expect(projectTranscriptSearch(view({ hits: hits(99) })).notices).toEqual([]);
    });

    it("projects empty hits truthfully: no rows, no notices", () => {
        expect(projectTranscriptSearch(view())).toEqual({ rows: [], notices: [] });
    });
});

describe("projectTranscriptSearchResult", () => {
    it("routes 'error' to a failure notice distinct from unavailable", () => {
        const projection = projectTranscriptSearchResult({ state: "error", message: "connection refused" });
        expect(projection.rows).toEqual([]);
        expect(projection.notices).toEqual(["Session search failed — connection refused"]);
    });

    it("routes 'unavailable' to the unavailable notice", () => {
        const projection = projectTranscriptSearchResult({ state: "unavailable", reason: "no sessions" });
        expect(projection.notices).toEqual(["Session search unavailable — no sessions"]);
    });

    it("routes 'loaded' through the view projection", () => {
        const projection = projectTranscriptSearchResult({ state: "loaded", view: view({ hits: [hit("s1")] }) });
        expect(projection.rows).toHaveLength(1);
    });
});

describe("transcriptCommands", () => {
    it("maps rows to palette commands with transcript ids, hit-count titles, snippet keywords", () => {
        const opened: string[] = [];
        const cmds = transcriptCommands(
            {
                rows: [
                    { sessionId: "0123456789abcdef", hitCount: 2, snippets: ["fix the auth flow", "login page"] },
                    { sessionId: "s2", hitCount: 1, snippets: ["beta"] },
                ],
                notices: [],
            },
            (sessionId) => opened.push(sessionId)
        );
        expect(cmds.map((c) => c.id)).toEqual(["transcript:0123456789abcdef", "transcript:s2"]);
        expect(cmds[0].title).toContain("2 matches");
        expect(cmds[1].title).toContain("1 match");
        expect(cmds[0].keywords).toContain("fix the auth flow");
        // The full session id stays searchable even when the title shortens it.
        expect(cmds[0].keywords).toContain("0123456789abcdef");
        cmds[0].run();
        expect(opened).toEqual(["0123456789abcdef"]);
    });

    it("renders notices as non-actionable rows after the session rows", () => {
        const cmds = transcriptCommands(
            { rows: [{ sessionId: "s1", hitCount: 1, snippets: [] }], notices: ["showing first 100 matches"] },
            () => {}
        );
        expect(cmds.map((c) => c.id)).toEqual(["transcript:s1", "transcript-notice:0"]);
        expect(cmds[1].title).toBe("showing first 100 matches");
        expect(() => cmds[1].run()).not.toThrow();
    });

    it("projects an empty projection to no commands", () => {
        expect(transcriptCommands({ rows: [], notices: [] }, () => {})).toEqual([]);
    });
});
