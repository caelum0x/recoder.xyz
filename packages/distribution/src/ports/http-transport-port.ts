/**
 * The minimal HTTP seam the device-flow CLIENT speaks over. It is a structural
 * subset of the WHATWG `fetch` so a host can pass `globalThis.fetch` directly,
 * or inject a deterministic transport in tests (no network). recoder.xyz is the
 * endpoint; the base URL is injected (never a hardcoded localhost).
 *
 * Keeping this narrow (one method, JSON in/out) means the client stays pure and
 * testable: the state machine is exercised by feeding canned responses.
 */
export interface HttpResponse {
  readonly status: number;
  /** Parsed JSON body. `null` when the body was empty/unparseable. */
  readonly body: unknown;
}

export interface HttpRequest {
  readonly url: string;
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  /** Already-encoded request body (form-urlencoded for RFC 8628). */
  readonly body: string;
}

export interface HttpTransportPort {
  post(request: HttpRequest): Promise<HttpResponse>;
}
