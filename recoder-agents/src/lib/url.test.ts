import { describe, expect, it } from 'vitest';

import {
  appendUrlSearchParam,
  buildProjectAppPreviewUrl,
  buildSandboxFileUrl,
  buildSandboxPortPreviewUrl,
  constructHtmlPreviewUrl,
} from '@/lib/utils/url';

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

describe('buildSandboxPortPreviewUrl', () => {
  it('builds a Daytona preview hostname from a sandbox id', () => {
    expect(buildSandboxPortPreviewUrl('sandbox-123', 5173)).toBe(
      'https://5173-sandbox-123.sandbox.recoder.xyz',
    );
  });

  it('derives the sandbox id from the sandbox service URL', () => {
    expect(
      buildSandboxPortPreviewUrl('https://8080-sandbox-123.sandbox.recoder.xyz', 3000),
    ).toBe('https://3000-sandbox-123.sandbox.recoder.xyz');
  });
});

describe('buildProjectAppPreviewUrl', () => {
  it('prefers the Vite dev-server port for Vite projects', () => {
    expect(
      buildProjectAppPreviewUrl({
        sandboxId: 'sandbox-123',
        framework: 'vite',
      }),
    ).toBe('https://5173-sandbox-123.sandbox.recoder.xyz');
  });

  it('prefers the Next.js dev-server port for Next projects', () => {
    expect(
      buildProjectAppPreviewUrl({
        sandboxUrl: 'https://8080-sandbox-123.sandbox.recoder.xyz',
        framework: 'nextjs',
      }),
    ).toBe('https://3000-sandbox-123.sandbox.recoder.xyz');
  });

  it('uses exposed port URLs when the backend already provided them', () => {
    expect(
      buildProjectAppPreviewUrl({
        sandboxId: 'sandbox-123',
        framework: 'vite',
        exposedPorts: [
          { port: 3000, url: 'https://3000-sandbox-123.sandbox.recoder.xyz' },
          { port: 5173, url: 'https://custom-preview.recoder.xyz' },
        ],
      }),
    ).toBe('https://custom-preview.recoder.xyz');
  });
});
