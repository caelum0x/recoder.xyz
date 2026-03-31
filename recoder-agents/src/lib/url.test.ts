import { describe, expect, it } from 'vitest';

import { appendUrlSearchParam, buildSandboxFileUrl, constructHtmlPreviewUrl } from '@/lib/utils/url';

describe('buildSandboxFileUrl', () => {
  it('routes relative presentation paths through the same-origin proxy', () => {
    expect(buildSandboxFileUrl('sandbox-123', 'presentations/nike/metadata.json')).toBe(
      '/api/files/content?sandboxId=sandbox-123&path=%2Fhome%2Fdaytona%2Fpresentations%2Fnike%2Fmetadata.json',
    );
  });

  it('normalizes workspace-prefixed paths for the proxy', () => {
    expect(buildSandboxFileUrl('sandbox-123', '/workspace/presentations/nike/slide_01.html')).toBe(
      '/api/files/content?sandboxId=sandbox-123&path=%2Fhome%2Fdaytona%2Fpresentations%2Fnike%2Fslide_01.html',
    );
  });

  it('extracts the underlying path from existing sandbox content URLs', () => {
    expect(
      buildSandboxFileUrl(
        'sandbox-123',
        'https://api.recoder.xyz/v1/sandboxes/sandbox-123/files/content?path=%2Fhome%2Fdaytona%2Fpresentations%2Fnike%2Fmetadata.json',
      ),
    ).toBe(
      '/api/files/content?sandboxId=sandbox-123&path=%2Fhome%2Fdaytona%2Fpresentations%2Fnike%2Fmetadata.json',
    );
  });
});

describe('appendUrlSearchParam', () => {
  it('appends cache-busting params to proxy URLs without corrupting the encoded path', () => {
    const url = buildSandboxFileUrl('sandbox-123', 'presentations/nike/metadata.json');

    expect(appendUrlSearchParam(url, 't', 123)).toBe(
      '/api/files/content?sandboxId=sandbox-123&path=%2Fhome%2Fdaytona%2Fpresentations%2Fnike%2Fmetadata.json&t=123',
    );
  });

  it('appends cache-busting params to absolute sandbox URLs', () => {
    const url = constructHtmlPreviewUrl(
      'https://8080-sandbox-123.sandbox.recoder.xyz',
      '/workspace/presentations/nike/slide_01.html',
    );

    expect(appendUrlSearchParam(url, 't', 456)).toBe(
      'https://8080-sandbox-123.sandbox.recoder.xyz/presentations/nike/slide_01.html?t=456',
    );
  });
});
