import { describe, expect, it } from 'vitest';
import { buildDockerPreviewUpstreamHeaders } from '../preview';

describe('preview proxy upstream headers', () => {
  it('rewrites docker preview host and origin to loopback', () => {
    expect(buildDockerPreviewUpstreamHeaders(5173)).toEqual({
      host: '127.0.0.1:5173',
      origin: 'http://127.0.0.1:5173',
    });
  });

  it('preserves unrelated headers while overriding host and origin', () => {
    expect(buildDockerPreviewUpstreamHeaders(3000, {
      authorization: 'Bearer token',
      host: 'host.docker.internal:3000',
      origin: 'https://web.recoder.xyz',
    })).toEqual({
      authorization: 'Bearer token',
      host: '127.0.0.1:3000',
      origin: 'http://127.0.0.1:3000',
    });
  });
});
