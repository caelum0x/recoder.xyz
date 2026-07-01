import type { DocsPort } from "../ports/docs.port";
import type { BrainDoc } from "../domain/docs.types";

/**
 * REAL {@link DocsPort}, backed by the owned context7 service (packages/
 * context7-sdk speaks to https://context7.com/api).
 *
 * It performs context7's two-step resolve — `GET v2/libs/search` to turn a free
 * query into a concrete library id, then `GET v2/context` to pull that library's
 * doc snippets — behind an INJECTABLE fetch, parses the JSON the API emits, and
 * MAPS each snippet into a {@link BrainDoc}. The SDK is NOT imported: the wire
 * shape is replicated directly over fetch so this adapter adds no dependency and
 * is testable standalone with a fake fetch.
 *
 * Fail-safe doctrine (brain's law): no CONTEXT7_API_KEY, fetch throws, a non-200
 * status, or unparseable output all degrade to `[]` — this source NEVER throws.
 * Missing docs can only cost richness, never correctness.
 */

/** Minimal Response shape this adapter consumes (the seam the test fakes). */
export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

/** Runs an HTTP request and resolves a {@link FetchResponse} (fakeable seam). */
export type FetchImpl = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<FetchResponse>;

export interface Context7DocsOptions {
  /** Override the fetch implementation (defaults to the global fetch). */
  fetchImpl?: FetchImpl;
  /** context7 API key (defaults to process.env.CONTEXT7_API_KEY). */
  apiKey?: string;
  /** Override the API base URL (defaults to the context7 SDK base). */
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://context7.com/api";
const SEARCH_PATH = "v2/libs/search";
const CONTEXT_PATH = "v2/context";

/**
 * Default request timeout (ms) for the real fetch seam. Bounded so a hung or
 * unresponsive context7 endpoint can never block a Brain lookup forever — on
 * timeout the fetch aborts (throws), and `lookup`'s fail-safe catch degrades to
 * [] exactly as for any other network failure.
 */
const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Default fetch seam: delegate to the platform global fetch, guarded by an
 * AbortController timeout so a server that accepts the connection but never
 * replies degrades instead of stalling the lookup.
 */
async function defaultFetch(
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
): Promise<FetchResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return (await fetch(url, {
      ...init,
      signal: controller.signal,
    })) as unknown as FetchResponse;
  } finally {
    clearTimeout(timer);
  }
}

/** A context7 search result row (untrusted external shape). */
interface SearchResult {
  id?: unknown;
  title?: unknown;
  description?: unknown;
}

/** A context7 code snippet (untrusted external shape). */
interface CodeSnippet {
  codeTitle?: unknown;
  codeDescription?: unknown;
  codeList?: unknown;
  codeId?: unknown;
}

/** A context7 info snippet (untrusted external shape). */
interface InfoSnippet {
  content?: unknown;
  breadcrumb?: unknown;
  pageId?: unknown;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Build a GET url with query params (boundary-safe encoding). */
function buildUrl(
  baseUrl: string,
  path: string,
  query: Record<string, string>,
): string {
  const params = new URLSearchParams(query);
  return `${baseUrl.replace(/\/$/, "")}/${path}?${params.toString()}`;
}

/** Auth + content headers mirroring the context7 SDK's HttpClient. */
function headersFor(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

/** Flatten a snippet's codeList into fenced markdown blocks. */
function codeBlocks(codeList: unknown): string {
  if (!Array.isArray(codeList)) {
    return "";
  }
  return codeList
    .filter((c): c is { language?: unknown; code?: unknown } =>
      Boolean(c) && typeof c === "object",
    )
    .map((c) => `\`\`\`${str(c.language)}\n${str(c.code)}\n\`\`\``)
    .join("\n\n");
}

/** Map one code snippet to a BrainDoc (boundary normalization). */
function codeToDoc(library: string, snippet: CodeSnippet): BrainDoc {
  const description = str(snippet.codeDescription);
  const blocks = codeBlocks(snippet.codeList);
  const snippetText = description
    ? blocks
      ? `${description}\n\n${blocks}`
      : description
    : blocks;
  const title = str(snippet.codeTitle);
  const source = str(snippet.codeId);
  return {
    library,
    ...(title ? { title } : {}),
    ...(source.startsWith("http") ? { url: source } : {}),
    snippet: snippetText,
  };
}

/** Map one info snippet to a BrainDoc (boundary normalization). */
function infoToDoc(library: string, snippet: InfoSnippet): BrainDoc {
  const title = str(snippet.breadcrumb);
  const source = str(snippet.pageId);
  return {
    library,
    ...(title ? { title } : {}),
    ...(source.startsWith("http") ? { url: source } : {}),
    snippet: str(snippet.content),
  };
}

export class Context7Docs implements DocsPort {
  private readonly fetchImpl: FetchImpl;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: Context7DocsOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
    this.apiKey = options.apiKey ?? process.env["CONTEXT7_API_KEY"] ?? "";
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  async lookup(query: string, limit: number): Promise<BrainDoc[]> {
    // No key — never touch the network, degrade to empty.
    if (!this.apiKey || !query) {
      return [];
    }
    try {
      const libraryId = await this.resolveLibrary(query);
      if (!libraryId) {
        return [];
      }
      const docs = await this.fetchContext(query, libraryId);
      return limit > 0 ? docs.slice(0, limit) : docs;
    } catch {
      // context7 absent / network / parse failure — degrade, never throw.
      return [];
    }
  }

  /** Resolve a free query to a concrete library id (first match), or "". */
  private async resolveLibrary(query: string): Promise<string> {
    const url = buildUrl(this.baseUrl, SEARCH_PATH, {
      query,
      libraryName: query,
    });
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: headersFor(this.apiKey),
    });
    if (!res.ok) {
      return "";
    }
    const body: unknown = await res.json();
    const results = (body as { results?: unknown })?.results;
    if (!Array.isArray(results)) {
      return "";
    }
    for (const row of results) {
      const id = str((row as SearchResult)?.id);
      if (id) {
        return id;
      }
    }
    return "";
  }

  /** Pull doc snippets for a resolved library id and map to BrainDoc[]. */
  private async fetchContext(
    query: string,
    libraryId: string,
  ): Promise<BrainDoc[]> {
    const url = buildUrl(this.baseUrl, CONTEXT_PATH, {
      query,
      libraryId,
      type: "json",
    });
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: headersFor(this.apiKey),
    });
    if (!res.ok) {
      return [];
    }
    const body: unknown = await res.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return [];
    }
    const codeSnippets = (body as { codeSnippets?: unknown }).codeSnippets;
    const infoSnippets = (body as { infoSnippets?: unknown }).infoSnippets;
    const code = Array.isArray(codeSnippets)
      ? codeSnippets.map((s) => codeToDoc(libraryId, s as CodeSnippet))
      : [];
    const info = Array.isArray(infoSnippets)
      ? infoSnippets.map((s) => infoToDoc(libraryId, s as InfoSnippet))
      : [];
    return [...code, ...info];
  }
}

/** Construct the real context7-backed docs adapter (opt-in). */
export function createContext7Docs(options?: Context7DocsOptions): DocsPort {
  return new Context7Docs(options);
}
