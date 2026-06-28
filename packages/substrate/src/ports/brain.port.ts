/**
 * BrainPort — the prompt-enrichment seam (design §4.5 / §7).
 *
 * `docker-backend/src/conductor/bundle.ts` enriches a raw prompt with task
 * constraints, a git-nexus ContextPack, mem0 recall, and context7 docs. The
 * engine reaches it through this port so the substrate package stays
 * backend-free; if no brain is wired the engine uses the raw prompt unchanged.
 * Interface only.
 */
export interface BrainEnrichInput {
  /** The raw, user-supplied prompt to enrich. */
  prompt: string;
  /** Task id the work is for (constraints/verification context). */
  taskId?: string;
  /** Repo path/url the agent will operate on (context-pack scope). */
  repoPath?: string;
  /** Library/framework hint for context7 doc retrieval. */
  library?: string;
  /** User id whose mem0 recall to include. */
  userId?: string;
}

export interface BrainProvenanceRef {
  /** Source kind: 'task' | 'git-nexus' | 'mem0' | 'context7' | … */
  source: string;
  /** Stable reference into the source (ContextPack id, memory id, doc url). */
  ref: string;
}

export interface BrainEnrichResult {
  /** The enriched prompt actually handed to the agent CLI. */
  prompt: string;
  /** Provenance of every enrichment applied (audit trail). */
  sources: BrainProvenanceRef[];
}

export interface BrainPort {
  /** Enrich a raw prompt; truthful provenance is always returned. */
  enrichPrompt(input: BrainEnrichInput): Promise<BrainEnrichResult>;
}
