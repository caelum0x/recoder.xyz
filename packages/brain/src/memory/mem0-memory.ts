import type { MemoryPort } from "../ports/memory.port";
import type { BrainMemory } from "../domain/memory.types";

/**
 * REAL {@link MemoryPort}, backed by the owned self-hosted mem0 REST server
 * (py/mem0/server — FastAPI + pgvector). It speaks the two endpoints brain
 * needs over an INJECTABLE HTTP transport:
 *
 *   - recall  -> POST /search   { query, top_k, filters } -> { results: [...] }
 *   - remember-> POST /memories { messages, user_id, metadata }
 *
 * The transport is the only IO seam: by default it `fetch`es MEM0_BASE_URL with
 * an `X-API-Key` header, but tests inject a fake transport so the adapter is
 * green with no server or network. mem0 is consumed purely as an external REST
 * surface — never imported — so this package gains no runtime dependency.
 *
 * Fail-safe doctrine (brain's law): missing config, a thrown transport, a
 * non-2xx status, or unparseable JSON NEVER throws. recall degrades to [] and
 * remember degrades to a silent no-op. Real recall is additive; its absence can
 * only cost richness, never correctness.
 */

/** One HTTP request, fully built (the seam the test asserts + fakes). */
export interface Mem0Request {
  readonly method: "POST";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

/** The transport's view of a response (status carried so non-2xx degrades). */
export interface Mem0Response {
  readonly ok: boolean;
  readonly status: number;
  readonly text: string;
}

/** Performs one request (default: fetch; the test injects a fake). */
export type Mem0Transport = (request: Mem0Request) => Promise<Mem0Response>;

export interface Mem0MemoryOptions {
  /** Override the transport (defaults to a fetch-backed transport). */
  transport?: Mem0Transport;
  /** mem0 server base URL (defaults to env MEM0_BASE_URL). */
  baseUrl?: string;
  /** Per-user API key sent as X-API-Key (defaults to env MEM0_API_KEY). */
  apiKey?: string;
  /** Owning identifier for stored/recalled memories (defaults to MEM0_USER_ID or "recoder"). */
  userId?: string;
}

const DEFAULT_USER_ID = "recoder";

/**
 * Default request timeout (ms) for the real fetch transport. Bounded so a hung
 * or unresponsive mem0 server can never block a Brain recall/remember forever —
 * on timeout the fetch aborts (throws), and the adapter's fail-safe catch
 * degrades recall to [] / remember to a no-op, exactly as for any other failure.
 */
const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Default transport: fetch the mem0 server and normalize the response. Guards
 * the request with an AbortController timeout so a server that accepts the
 * connection but never replies degrades instead of stalling the caller.
 */
async function defaultTransport(request: Mem0Request): Promise<Mem0Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: { ...request.headers },
      body: request.body,
      signal: controller.signal,
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } finally {
    clearTimeout(timer);
  }
}

/** Strip a single trailing slash so `${base}/search` never double-slashes. */
function normalizeBase(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

/**
 * Build one mem0 request. Tiny + pure so the wire shape is trivially auditable
 * and the test can assert the exact url/headers/body without a server.
 */
export function buildMem0Request(
  baseUrl: string,
  apiKey: string,
  path: "/search" | "/memories",
  payload: Readonly<Record<string, unknown>>,
): Mem0Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }
  return {
    method: "POST",
    url: `${normalizeBase(baseUrl)}${path}`,
    headers,
    body: JSON.stringify(payload),
  };
}

/** A mem0 search hit as emitted by the server (untrusted external shape). */
interface Mem0Hit {
  id?: unknown;
  memory?: unknown;
  score?: unknown;
  metadata?: unknown;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Pull the result array out of `{ results: [...] }` or a bare array. */
function resultsOf(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (isRecord(parsed) && Array.isArray(parsed["results"])) {
    return parsed["results"];
  }
  return [];
}

/** Map one mem0 hit to a BrainMemory, or null when it carries no usable text. */
function toMemory(hit: unknown): BrainMemory | null {
  if (!isRecord(hit)) {
    return null;
  }
  const row = hit as Mem0Hit;
  const text = str(row.memory);
  if (!text) {
    return null;
  }
  const memory: BrainMemory = { id: str(row.id), text };
  if (typeof row.score === "number" && Number.isFinite(row.score)) {
    return isRecord(row.metadata)
      ? { ...memory, score: row.score, metadata: row.metadata }
      : { ...memory, score: row.score };
  }
  return isRecord(row.metadata)
    ? { ...memory, metadata: row.metadata }
    : memory;
}

export class Mem0Memory implements MemoryPort {
  private readonly transport: Mem0Transport;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly userId: string;

  constructor(options: Mem0MemoryOptions = {}) {
    this.transport = options.transport ?? defaultTransport;
    this.baseUrl =
      options.baseUrl ?? process.env["MEM0_BASE_URL"] ?? "";
    this.apiKey = options.apiKey ?? process.env["MEM0_API_KEY"] ?? "";
    this.userId =
      options.userId ?? process.env["MEM0_USER_ID"] ?? DEFAULT_USER_ID;
  }

  async recall(query: string, limit: number): Promise<BrainMemory[]> {
    if (!this.baseUrl) {
      return [];
    }
    try {
      const request = buildMem0Request(this.baseUrl, this.apiKey, "/search", {
        query,
        top_k: limit,
        filters: { user_id: this.userId },
      });
      const response = await this.transport(request);
      if (!response.ok) {
        return [];
      }
      const parsed: unknown = JSON.parse(response.text);
      return resultsOf(parsed)
        .map(toMemory)
        .filter((m): m is BrainMemory => m !== null);
    } catch {
      // mem0 absent / unreachable / non-JSON — degrade to empty, never throw.
      return [];
    }
  }

  async remember(
    text: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.baseUrl || !text) {
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        messages: [{ role: "user", content: text }],
        user_id: this.userId,
      };
      if (metadata && Object.keys(metadata).length > 0) {
        payload["metadata"] = metadata;
      }
      const request = buildMem0Request(
        this.baseUrl,
        this.apiKey,
        "/memories",
        payload,
      );
      await this.transport(request);
    } catch {
      // Persisting memory is best-effort — swallow any failure, never throw.
    }
  }
}

/** Construct the real mem0-backed memory adapter (opt-in, degrade-safe). */
export function createMem0Memory(
  options?: Mem0MemoryOptions,
): MemoryPort {
  return new Mem0Memory(options);
}
