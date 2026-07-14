import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type express from 'express';
import { getProjectIdFromRequest, isStrictAuthMode } from '../src/auth-utils';

function makeReq(overrides: Partial<express.Request>): express.Request {
  return {
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as express.Request;
}

describe('auth-utils', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('extracts projectId from params, body, or query', () => {
    expect(getProjectIdFromRequest(makeReq({ params: { projectId: 'p1' } }))).toBe('p1');
    expect(getProjectIdFromRequest(makeReq({ body: { projectId: 'p2' } }))).toBe('p2');
    expect(getProjectIdFromRequest(makeReq({ query: { projectId: 'p3' } }))).toBe('p3');
    expect(getProjectIdFromRequest(makeReq({ query: { containerId: 'p4' } }))).toBe('p4');
  });

  it('defaults strict auth to true in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.REQUIRE_AUTH;
    expect(isStrictAuthMode()).toBe(true);
  });

  it('respects REQUIRE_AUTH in non-production', () => {
    process.env.NODE_ENV = 'development';
    process.env.REQUIRE_AUTH = 'true';
    expect(isStrictAuthMode()).toBe(true);

    process.env.REQUIRE_AUTH = 'false';
    expect(isStrictAuthMode()).toBe(false);
  });
});
