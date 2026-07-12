/**
 * embed — the `EmbeddingPort` shape the retrieval engine consumes. It is
 * INJECTED, never constructed here: the concrete embedder lives in the backend's
 * shared vector foundation (`docker-backend/src/agent-os/mcp/vector-store.ts`,
 * `createEmbeddingPort`). This module only re-declares the structural contract so
 * `packages/retrieval` stays runtime-agnostic and unit-testable with a fake.
 *
 * DEGRADE CONTRACT (mirrors the foundation): `embed` returns `null` when no
 * provider is configured or any error occurs — the engine then reports
 * "retrieval not configured" instead of throwing or fabricating vectors. An
 * empty input returns `[]` (a no-op, not a degrade).
 */

export interface EmbeddingPort {
	/**
	 * Which provider (if any) is wired. Optional + loosely typed so a concrete
	 * port whose `provider` is a narrower union (e.g. 'tensorzero'|'openai'|'none')
	 * is structurally assignable. `'none'` (or absent) means unconfigured.
	 */
	readonly provider?: string;
	/**
	 * Embed `texts` into vectors, preserving order. Returns `null` when no
	 * provider is configured or on any failure; `[]` for empty input.
	 */
	embed(texts: string[]): Promise<number[][] | null>;
}
