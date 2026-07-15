/**
 * Tiny express req/res mocks for boundary-middleware unit tests (no HTTP server).
 * Captures the sent status + JSON body + headers so a test can assert the
 * canonical envelope a middleware produced.
 */
import type { Request, Response } from 'express';

export interface MockResult {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  ended: boolean;
  finish(): void;
}

export interface MockReqInit {
  method?: string;
  path?: string;
  baseUrl?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: unknown;
  params?: Record<string, string>;
  ip?: string;
  principal?: unknown;
}

/** Build a mock express Request. */
export function mockReq(init: MockReqInit = {}): Request {
  const req = {
    method: init.method ?? 'GET',
    path: init.path ?? '/',
    baseUrl: init.baseUrl ?? '',
    url: `${init.baseUrl ?? ''}${init.path ?? '/'}`,
    headers: init.headers ?? {},
    body: init.body,
    query: init.query ?? {},
    params: init.params ?? {},
    ip: init.ip ?? '127.0.0.1',
    principal: init.principal,
  };
  return req as unknown as Request;
}

/** Build a mock express Response capturing status/json/headers + a `finish` emitter. */
export function mockRes(): Response & { result: MockResult } {
  const finishListeners: Array<() => void> = [];
  const result: MockResult = {
    statusCode: 200,
    body: undefined,
    headers: {},
    ended: false,
    finish(): void {
      for (const fn of finishListeners) fn();
    },
  };
  const res = {
    result,
    headersSent: false,
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      result.body = payload;
      (this as { headersSent: boolean }).headersSent = true;
      return this;
    },
    setHeader(name: string, value: string) {
      result.headers[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name: string) {
      return result.headers[name.toLowerCase()];
    },
    end() {
      result.ended = true;
      (this as { headersSent: boolean }).headersSent = true;
      return this;
    },
    on(event: string, cb: () => void) {
      if (event === 'finish') finishListeners.push(cb);
      return this;
    },
  };
  return res as unknown as Response & { result: MockResult };
}
