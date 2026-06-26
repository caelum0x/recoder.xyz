import type { ActivityPort } from "../ports/activity.port";
import type {
  BrainActivity,
  BrainActivityProfile,
} from "../domain/activity.types";
import type {
  ContinuumActivityRow,
  ContinuumProfile,
  ContinuumEmbed,
} from "@recoder/continuum/engines";

/**
 * Default {@link ActivityPort}, backed by the OWNED continuum engine IN-PROCESS.
 *
 * This is the fusion seam (docs/CONTINUUM-PLAN.md §2). Brain imports the real continuum
 * engines (`@recoder/continuum/engines`) and calls them directly — NO subprocess, NO
 * JSON-over-stdout. It mirrors how the repo-intel port consumes `@recoder/recodergit`
 * (`createContextPack`) in-process. The previous implementation shelled out to the
 * `continuum` CLI binary; that thin-adapter pattern is gone.
 *
 * Fail-safe doctrine: continuum never throws here. If the engine is absent or the store is
 * empty/missing, recall → [], recent → [], profile → null, snapshot → null. A missing source
 * degrades; the Brain keeps working.
 */

/** The continuum engine module, loaded lazily once (cached after first import). */
type ContinuumEngines = typeof import("@recoder/continuum/engines");

export interface ContinuumActivityOptions {
  /**
   * Optional embedding fn for the hybrid search index. Null/omitted = lexical-only index
   * (recall still works, just without semantic embedding). Default null = zero-config.
   * E1 (on-box Qdrant embed tier) will wire a real fn here without touching this adapter.
   */
  embed?: ContinuumEmbed | null;
  /**
   * Optional LLM for a synthesized profile. Null/omitted = heuristic-only profile (the free
   * default). R2 (grounded recall) wires a real fn here.
   */
  llm?: ((system: string, user: string, max: number) => Promise<string>) | null;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

/** Map a continuum activity row to a BrainActivity (boundary normalization). */
function toActivity(row: ContinuumActivityRow): BrainActivity {
  return {
    when: row.when ?? "",
    app: row.app ?? "",
    who: row.who === "you" || row.who === "others" || row.who === "system" ? row.who : "system",
    type: row.type ?? "",
    text: row.text ?? "",
    id: row.id ?? "",
  };
}

/** Map a continuum profile to a BrainActivityProfile (boundary normalization). */
function toProfile(profile: ContinuumProfile): BrainActivityProfile {
  const brief = profile.brief;
  return {
    kind: profile.kind ?? "",
    ...(brief ? { brief } : {}),
    apps: strArray(profile.apps),
    tools: strArray(profile.types),
    recurring: strArray(profile.recurring),
  };
}

export class ContinuumActivity implements ActivityPort {
  private readonly embed: ContinuumEmbed | null;
  private readonly llm: ((s: string, u: string, m: number) => Promise<string>) | null;
  /** Lazily-loaded engine module (cached). */
  private enginesPromise: Promise<ContinuumEngines> | null = null;

  constructor(options: ContinuumActivityOptions = {}) {
    this.embed = options.embed ?? null;
    this.llm = options.llm ?? null;
  }

  /** Load the continuum engine module once; cache the promise. */
  private async engines(): Promise<ContinuumEngines> {
    if (!this.enginesPromise) {
      this.enginesPromise = import("@recoder/continuum/engines");
    }
    return this.enginesPromise;
  }

  async recall(query: string, limit: number): Promise<BrainActivity[]> {
    try {
      const e = await this.engines();
      const episodes = e.loadEpisodes(); // [] if store absent — fail-safe
      const index = await e.loadIndex(this.embed); // lexical-only if embed null
      const rows = await e.recall(index, episodes, { query, k: limit });
      return rows.map(toActivity);
    } catch {
      // Engine absent or errored — degrade to empty, never throw.
      return [];
    }
  }

  async profile(topic?: string): Promise<BrainActivityProfile | null> {
    try {
      const e = await this.engines();
      const episodes = e.loadEpisodes();
      const result = await e.profile(episodes, { ...(topic ? { topic } : {}), llm: this.llm });
      return toProfile(result);
    } catch {
      // Engine absent or errored — degrade to null, never throw.
      return null;
    }
  }

  /** Recent activity, newest-first, deduped (no query). Maps continuum's catchUp. */
  async recent(limit = 12): Promise<BrainActivity[]> {
    try {
      const e = await this.engines();
      const episodes = e.loadEpisodes();
      const rows = e.catchUp(episodes, { limit });
      return rows.map(toActivity);
    } catch {
      return [];
    }
  }

  /** One-line "who is this user" snapshot (no LLM). null if no activity. */
  async snapshot(): Promise<string | null> {
    try {
      const e = await this.engines();
      const episodes = e.loadEpisodes();
      return e.snapshot(episodes);
    } catch {
      return null;
    }
  }
}

/** Construct the default continuum-backed activity adapter (in-process, no shell-out). */
export function createContinuumActivity(
  options?: ContinuumActivityOptions,
): ActivityPort {
  return new ContinuumActivity(options);
}
