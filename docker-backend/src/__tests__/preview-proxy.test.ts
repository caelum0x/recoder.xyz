import http from 'http';
import type { AddressInfo } from 'net';
import { describe, expect, it } from 'vitest';
import { buildDockerPreviewUpstreamHeaders, checkPort } from '../preview';

async function withHttpServer(statusCode: number, run: (port: number) => Promise<void>): Promise<void> {
  const server = http.createServer((_req, res) => {
    res.statusCode = statusCode;
    res.end('ok');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;

  try {
    await run(port);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

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

describe('checkPort', () => {
  it('treats non-5xx HTTP responses as preview-ready', async () => {
    await withHttpServer(404, async (port) => {
      await expect(checkPort(port)).resolves.toBe(true);
    });
  });

  it('treats 5xx HTTP responses as not ready', async () => {
    await withHttpServer(503, async (port) => {
      await expect(checkPort(port)).resolves.toBe(false);
    });
  });
});
