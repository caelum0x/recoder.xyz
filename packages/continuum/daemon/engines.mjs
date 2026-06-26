// In-process consumer surface for @recoder/continuum.
//
// These are the REAL continuum engines — re-exported, never reimplemented. Recoder's Brain
// (and any other in-process consumer) calls them directly via `import("@recoder/continuum/engines")`,
// with NO subprocess and NO JSON-over-stdout. This is the fusion seam (docs/CONTINUUM-PLAN.md §2).
//
// Fail-safe: loadEpisodes() returns [] when the store is absent; loadIndex() degrades to a
// lexical-only index when no embedding model is configured. A missing source degrades; it never throws.
export { loadEpisodes, loadIndex } from './store.mjs';
export { recall, catchUp, profile, snapshot } from './mcp.mjs';
export { answerQuery } from './retrieval.mjs';
