/**
 * @module request-validation.test
 *
 * Test suite for the reusable A2A request validation middleware.
 *
 * Covers:
 * - validateIdParam: valid IDs, empty strings, invalid characters
 * - validateRequiredFields: all present, missing, wrong type, null body
 * - validateOptionalFields: absent fields, present with wrong type
 * - validatePaginationParams: no params, valid, negative offset, over-limit
 * - validateRestAdapterConfig: valid, missing baseUrl
 * - validateGitAdapterConfig: valid, missing repoPath
 * - validateExecuteBody: valid, missing prompt
 * - validateCapabilityMatchBody: missing requiredCapabilities
 * - validateAggregationBody: invalid strategy
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateIdParam,
  validateRequiredFields,
  validateOptionalFields,
  validatePaginationParams,
  validateRestAdapterConfig,
  validateGitAdapterConfig,
  validateExecuteBody,
  validateCapabilityMatchBody,
  validateAggregationBody,
} from '../request-validation.middleware';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMockReq(overrides?: { body?: any; params?: any; query?: any }): any {
  return {
    body: overrides && 'body' in overrides ? overrides.body : {},
    params: overrides?.params ?? {},
    query: overrides?.query ?? {},
    headers: {},
  };
}

function makeMockRes(): any {
  const res: any = {
    _status: 200,
    _data: null as any,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: any) {
      res._data = data;
      return res;
    },
  };
  return res;
}

function makeMockNext() {
  return vi.fn();
}

// ===========================================================================
// validateIdParam
// ===========================================================================

describe('validateIdParam', () => {
  const middleware = validateIdParam('taskId');

  it('passes for a valid ID', () => {
    const req = makeMockReq({ params: { taskId: 'task-123_v1.0' } });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res._status).toBe(200);
  });

  it('returns 400 for an empty string ID', () => {
    const req = makeMockReq({ params: { taskId: '' } });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    expect(res._data.success).toBe(false);
    expect(res._data.error.message).toContain('taskId');
  });

  it('returns 400 for invalid characters in ID', () => {
    const req = makeMockReq({ params: { taskId: 'task@#$!' } });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    expect(res._data.success).toBe(false);
    expect(res._data.error.message).toContain('invalid characters');
  });
});

// ===========================================================================
// validateRequiredFields
// ===========================================================================

describe('validateRequiredFields', () => {
  const middleware = validateRequiredFields([
    { name: 'name', type: 'string' },
    { name: 'count', type: 'number' },
    { name: 'tags', type: 'array' },
  ]);

  it('passes when all fields are present with correct types', () => {
    const req = makeMockReq({ body: { name: 'test', count: 5, tags: ['a'] } });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 400 with field name when a field is missing', () => {
    const req = makeMockReq({ body: { name: 'test', tags: [] } });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    expect(res._data.error.message).toContain('count');
    expect(res._data.error.details.validation_issues).toEqual(
      expect.arrayContaining([expect.stringContaining('count')]),
    );
  });

  it('returns 400 when a field has the wrong type', () => {
    const req = makeMockReq({ body: { name: 123, count: 5, tags: ['a'] } });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    expect(res._data.error.message).toContain('name');
  });

  it('returns 400 when body is null', () => {
    const req = makeMockReq({ body: null });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    expect(res._data.error.message).toContain('JSON object');
  });
});

// ===========================================================================
// validateOptionalFields
// ===========================================================================

describe('validateOptionalFields', () => {
  const middleware = validateOptionalFields([
    { name: 'description', type: 'string' },
    { name: 'priority', type: 'number' },
  ]);

  it('passes when optional fields are absent', () => {
    const req = makeMockReq({ body: {} });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when a present optional field has the wrong type', () => {
    const req = makeMockReq({ body: { description: 42 } });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    expect(res._data.error.message).toContain('description');
  });
});

// ===========================================================================
// validatePaginationParams
// ===========================================================================

describe('validatePaginationParams', () => {
  const middleware = validatePaginationParams(100);

  it('passes when no params are provided', () => {
    const req = makeMockReq({ query: {} });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes with valid limit and offset', () => {
    const req = makeMockReq({ query: { limit: '50', offset: '10' } });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for negative offset and limit exceeding max', () => {
    const req = makeMockReq({ query: { limit: '200', offset: '-1' } });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    // Both issues should be reported
    const issues = res._data.error.details.validation_issues as string[];
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('limit'),
        expect.stringContaining('offset'),
      ]),
    );
  });
});

// ===========================================================================
// validateRestAdapterConfig
// ===========================================================================

describe('validateRestAdapterConfig', () => {
  const middleware = validateRestAdapterConfig();

  it('passes with a valid config', () => {
    const req = makeMockReq({
      body: { adapterId: 'rest-1', baseUrl: 'https://example.com' },
    });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when baseUrl is missing', () => {
    const req = makeMockReq({ body: { adapterId: 'rest-1' } });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    expect(res._data.error.message).toContain('baseUrl');
  });
});

// ===========================================================================
// validateGitAdapterConfig
// ===========================================================================

describe('validateGitAdapterConfig', () => {
  const middleware = validateGitAdapterConfig();

  it('passes with a valid config', () => {
    const req = makeMockReq({
      body: { adapterId: 'git-1', repoPath: '/repos/my-project' },
    });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when repoPath is missing', () => {
    const req = makeMockReq({ body: { adapterId: 'git-1' } });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    expect(res._data.error.message).toContain('repoPath');
  });
});

// ===========================================================================
// validateExecuteBody
// ===========================================================================

describe('validateExecuteBody', () => {
  const middleware = validateExecuteBody();

  it('passes with a valid prompt', () => {
    const req = makeMockReq({ body: { prompt: 'Build a todo app' } });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when prompt is missing', () => {
    const req = makeMockReq({ body: { taskId: 'abc' } });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    expect(res._data.error.message).toContain('prompt');
  });
});

// ===========================================================================
// validateCapabilityMatchBody
// ===========================================================================

describe('validateCapabilityMatchBody', () => {
  const middleware = validateCapabilityMatchBody();

  it('returns 400 when requiredCapabilities is missing', () => {
    const req = makeMockReq({ body: { preferredPlatform: 'codex' } });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    expect(res._data.error.message).toContain('requiredCapabilities');
  });
});

// ===========================================================================
// validateAggregationBody
// ===========================================================================

describe('validateAggregationBody', () => {
  const middleware = validateAggregationBody();

  it('returns 400 for an invalid strategy value', () => {
    const req = makeMockReq({
      body: {
        parentTaskId: 'task-1',
        subtaskResults: [{ taskId: 'sub-1', result: {} }],
        strategy: 'invalid-strategy',
      },
    });
    const res = makeMockRes();
    const next = makeMockNext();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(400);
    expect(res._data.error.message).toContain('strategy');
    expect(res._data.error.message).toContain('invalid-strategy');
  });
});
