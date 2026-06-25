import type { ContextPack, CreateContextPackInput } from "@recoder/git-nexus";

/**
 * Repo-intelligence seam — the assembly core.
 *
 * The real GitNexus engine (ts/gitnexus: tree-sitter parse -> scope resolution ->
 * knowledge graph -> lbug storage -> embeddings -> hybrid search) is merged in
 * behind this port. The engine behind it gets real while this contract stays
 * stable, so the Brain's core never depends on the concrete indexer.
 */
export interface RepoIntelPort {
  /** Build (or reuse) repo intelligence for a task and return the context pack. */
  contextPack(input: CreateContextPackInput): Promise<ContextPack>;
}
