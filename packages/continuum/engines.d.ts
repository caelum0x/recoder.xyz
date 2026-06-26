// Typed consumer surface for @recoder/continuum/engines — the in-process fusion seam.
// Types mirror the real .mjs engine (daemon/engines.mjs re-exports daemon/store.mjs +
// daemon/mcp.mjs + daemon/retrieval.mjs). Consumers (Brain) call these directly; no subprocess.

/**
 * One attributed activity row, as produced by `recall` / `catchUp`. This is the egress shape
 * continuum serializes, so Brain's boundary normalizer maps it unchanged.
 */
export interface ContinuumActivityRow {
  /** Human relative time, e.g. "12m ago · Thu 14:30". */
  when: string;
  /** Source application, e.g. "Terminal", "VS Code". */
  app: string;
  /** Attribution: who the activity belongs to. */
  who: 'you' | 'others' | 'system';
  /** Activity type, e.g. "command", "edit", "commit". */
  type: string;
  /** Scrubbed, snippet-capped text (PII + secret-shaped strings redacted). */
  text: string;
  /** Stable citation id, e.g. "ep_<content_hash>". */
  id: string;
}

/**
 * Synthesized understanding of the user. Heuristic by default; LLM-enriched when a model is
 * configured (then `kind === 'synthesized'` and `brief` is present).
 */
export interface ContinuumProfile {
  kind: 'heuristic' | 'synthesized';
  brief?: string;
  note?: string;
  topic?: string | null;
  apps: string[];
  types: string[];
  recurring: string[];
  voice_samples: string[];
  sources: ContinuumActivityRow[];
  patterns?: {
    focus?: number;
    peakHour?: number | null;
    apps?: string[];
    dayParts?: Record<string, number>;
    transitions?: Array<[string, string, number]>;
  };
  expertise?: unknown;
  goals?: { active: unknown; stuck: unknown };
}

/**
 * A captured episode. Opaque to consumers — obtained from `loadEpisodes()`, passed back into
 * the engines. Only the structural fields the engines read are declared.
 */
export interface ContinuumEpisode {
  start?: number;
  end?: number;
  app?: string;
  text?: string;
  content_hash?: string;
  speaker?: string;
  source_mix?: string[];
  label?: { type?: string; owner?: string };
  structured?: { summary?: string; authored?: string };
  [key: string]: unknown;
}

/** The hybrid (lexical + embedding) search index over episodes. */
export interface ContinuumIndex {
  search(
    query: string,
    opts?: { k?: number; now?: number },
  ): Promise<Array<{ ep: ContinuumEpisode; score?: number }>>;
}

/** Optional embedding function; when omitted the index is lexical-only (recall still works). */
export type ContinuumEmbed = (text: string) => Promise<number[]>;

export interface RecallOpts {
  query?: string;
  since?: string | number | null;
  until?: string | number | null;
  apps?: string[];
  sources?: string[];
  k?: number;
  exclude?: string[];
  floor?: number;
  now?: number;
}

export interface CatchUpOpts {
  window?: string;
  limit?: number;
  exclude?: string[];
  floor?: number;
  now?: number;
}

export interface ProfileOpts {
  topic?: string;
  llm?: ((system: string, user: string, max: number) => Promise<string>) | null;
  exclude?: string[];
  floor?: number;
  now?: number;
}

/** Load all episodes from the store (`~/.continuum/episodes.ndjson` or `CONTINUUM_DATA`). Returns [] if absent. */
export function loadEpisodes(): ContinuumEpisode[];

/** Build the hybrid index over the loaded episodes. Lexical-only when `embed` is omitted/null. */
export function loadIndex(embed?: ContinuumEmbed | null): Promise<ContinuumIndex>;

/** Semantic search + filters → attributed snippets. */
export function recall(
  index: ContinuumIndex,
  episodes: ContinuumEpisode[],
  opts?: RecallOpts,
): Promise<ContinuumActivityRow[]>;

/** Recent activity, newest-first, deduped (no query needed). */
export function catchUp(
  episodes: ContinuumEpisode[],
  opts?: CatchUpOpts,
): ContinuumActivityRow[];

/** Synthesized understanding of the user (heuristic by default). */
export function profile(
  episodes: ContinuumEpisode[],
  opts?: ProfileOpts,
): Promise<ContinuumProfile>;

/** Cheap one-line "who is this user" snapshot (no LLM). null if no activity. */
export function snapshot(
  episodes: ContinuumEpisode[],
  opts?: { exclude?: string[]; now?: number },
): string | null;

/** Grounded answer fusing KG facts + recall context; `answer` is null when no LLM is configured. */
export function answerQuery(
  query: string,
  opts: {
    index: ContinuumIndex;
    graph?: { search(query: string, group: string, k: number): Promise<{ results?: unknown[] }> } | null;
    llm?: ((system: string, user: string, max: number) => Promise<string>) | null;
    k?: number;
    now?: number;
    group?: string;
  },
): Promise<{ hits: unknown[]; facts: unknown[]; answer: string | null }>;
