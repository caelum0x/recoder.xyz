// Owned by Recoder. Shared test harness for the per-channel end-to-end dispatch
// tests. These tests exercise the REAL per-channel ConnectorPort adapters
// (real normalize + real send) wired into the REAL ConnectorRegistry +
// dispatchInbound + resolveGate pipeline. Nothing in the dispatch path is
// mocked: the ONLY thing replaced is the channel's true SDK seam (the HTTP
// `fetch` it speaks, or its injected SDK client), so a real normalized inbound
// message routes gate -> embedded runner -> the adapter's real send() without a
// live network or a live channel account.
//
// This file is intentionally NOT under src/ (it imports the adapter subtrees,
// which live outside the package's rootDir). It is run by vitest via the
// integration include in vitest.config.ts; it is never part of the published
// build (tsup entries are the foundation + the per-channel adapter barrels).

import type {
  EmbeddedRunEvent,
  EmbeddedRunRequest,
  EmbeddedRunner,
} from "../../src/agents/embedded-runner.js";

/** A scripted EmbeddedRunner: yields a fixed event script, records requests. */
export function scriptedRunner(
  events: EmbeddedRunEvent[],
  sink?: EmbeddedRunRequest[],
): EmbeddedRunner {
  return {
    run(request: EmbeddedRunRequest): AsyncIterable<EmbeddedRunEvent> {
      sink?.push(request);
      async function* gen(): AsyncGenerator<EmbeddedRunEvent> {
        for (const ev of events) {
          yield ev;
        }
      }
      return gen();
    },
  };
}

/** A runner that simply replies with a fixed string then completes. */
export function replyingRunner(
  reply: string,
  sink?: EmbeddedRunRequest[],
): EmbeddedRunner {
  return scriptedRunner(
    [
      { type: "text", text: reply },
      { type: "done", usage: { inputTokens: 8, outputTokens: 4 } },
    ],
    sink,
  );
}

/** One recorded HTTP call against the doubled `fetch` seam. */
export interface RecordedFetch {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
  readonly headers: Record<string, string>;
}

/** A route handler: given the recorded call, return the JSON body to respond. */
export type FetchRoute = (call: RecordedFetch) => {
  status?: number;
  json?: unknown;
  text?: string;
} | undefined;

/** A `fetch` double that records every call and answers via ordered routes. */
export interface FetchDouble {
  readonly fetch: typeof fetch;
  readonly calls: RecordedFetch[];
  /** Calls whose URL contains `fragment`. */
  callsMatching(fragment: string): RecordedFetch[];
}

function headersToObject(init?: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  if (!init) {
    return out;
  }
  if (init instanceof Headers) {
    init.forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
    return out;
  }
  if (Array.isArray(init)) {
    for (const [key, value] of init) {
      out[String(key).toLowerCase()] = String(value);
    }
    return out;
  }
  for (const [key, value] of Object.entries(init)) {
    out[key.toLowerCase()] = String(value);
  }
  return out;
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") {
    return body ?? null;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

/**
 * Build a `fetch` double. `routes` are tried in order for each request; the
 * first one returning a response wins. An unmatched request resolves to a 404
 * so a misrouted call fails loudly rather than hanging.
 */
export function makeFetchDouble(routes: FetchRoute[]): FetchDouble {
  const calls: RecordedFetch[] = [];

  const fetchImpl = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const call: RecordedFetch = {
      url,
      method,
      body: parseBody(init?.body ?? null),
      headers: headersToObject(init?.headers),
    };
    calls.push(call);

    for (const route of routes) {
      const result = route(call);
      if (result) {
        const status = result.status ?? 200;
        if (result.text !== undefined) {
          return new Response(result.text, { status });
        }
        return new Response(JSON.stringify(result.json ?? {}), {
          status,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify({ error: `unrouted ${method} ${url}` }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return {
    fetch: fetchImpl,
    calls,
    callsMatching(fragment: string): RecordedFetch[] {
      return calls.filter((c) => c.url.includes(fragment));
    },
  };
}

/**
 * Install a `fetch` double on `globalThis.fetch` for the duration of `fn`,
 * restoring the original afterwards. Several adapters (signal/whatsapp/feishu)
 * speak the channel wire protocol over the runtime's global `fetch`, so that IS
 * their true SDK seam.
 */
export async function withGlobalFetch<T>(
  double: FetchDouble,
  fn: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = double.fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}
