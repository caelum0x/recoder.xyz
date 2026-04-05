import { describe, expect, it } from 'vitest';

import { getCorsHeadersForOrigin } from '../cors-utils.js';

describe('getCorsHeadersForOrigin', () => {
  const allowedOrigins = ['https://web.recoder.xyz', 'https://agents.recoder.xyz'];

  it('returns CORS headers for allowed origins', () => {
    expect(getCorsHeadersForOrigin('https://web.recoder.xyz', allowedOrigins)).toEqual({
      'Access-Control-Allow-Origin': 'https://web.recoder.xyz',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Recoder-Anonymous-Id',
      Vary: 'Origin',
    });
  });

  it('returns no CORS headers for disallowed origins', () => {
    expect(getCorsHeadersForOrigin('https://evil.example', allowedOrigins)).toEqual({});
  });

  it('returns no CORS headers when the request has no origin', () => {
    expect(getCorsHeadersForOrigin(undefined, allowedOrigins)).toEqual({});
  });
});

