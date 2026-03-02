import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Router } from 'express';
import { sseStreamRouter } from '../sse-stream.router';
import { claudeConnectorRouter } from '../claude-connector.routes';
import { codexConnectorRouter } from '../codex-connector.routes';
import { contextBridgeRouter } from '../context-bridge.routes';
import { connectorHealthRouter } from '../connector-health.routes';
import { patternRouter } from '../patterns/pattern.routes';
import { a2aOpenApiRouter } from '../openapi.routes';

type RouteMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

const METHODS: RouteMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

function normalizeExpressPath(path: string): string {
  const normalized = path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

function normalizeRoute(method: string, path: string): string {
  return `${method.toLowerCase()} ${path}`;
}

function collectMountedRoutes(mountPath: string, router: Router): Set<string> {
  const routes = new Set<string>();
  for (const layer of (router as any).stack ?? []) {
    if (!layer.route?.path || !layer.route?.methods) {
      continue;
    }
    const routePath = normalizeExpressPath(`${mountPath}${layer.route.path}`);
    for (const method of METHODS) {
      if (layer.route.methods[method]) {
        routes.add(normalizeRoute(method, routePath));
      }
    }
  }
  return routes;
}

function parseOpenApiRouteSet(openApiYaml: string): Set<string> {
  const lines = openApiYaml.split('\n');
  const routes = new Set<string>();
  let currentPath: string | null = null;

  for (const line of lines) {
    const pathMatch = line.match(/^  (\/api\/a2a\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    if (!currentPath) {
      continue;
    }

    const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/);
    if (methodMatch) {
      routes.add(normalizeRoute(methodMatch[1], currentPath));
      continue;
    }

    const newTopLevel = line.match(/^[^ ]/);
    if (newTopLevel) {
      currentPath = null;
    }
  }

  return routes;
}

function diff(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((item) => !right.has(item)).sort();
}

function inPhase15Scope(route: string): boolean {
  const [, path] = route.split(' ');
  return (
    path.startsWith('/api/a2a/connectors/') ||
    path.startsWith('/api/a2a/context') ||
    path.startsWith('/api/a2a/patterns') ||
    path.startsWith('/api/a2a/events/stream') ||
    path.startsWith('/api/a2a/tasks/{taskId}/stream') ||
    path.startsWith('/api/a2a/channels/{channelId}/stream') ||
    path.startsWith('/api/a2a/openapi.yaml') ||
    path.startsWith('/api/a2a/docs')
  );
}

describe('A2A OpenAPI drift check', () => {
  it('keeps mounted A2A route surface in sync with docs/a2a-openapi.yaml', () => {
    const mounted = new Set<string>([
      ...collectMountedRoutes('/api/a2a', sseStreamRouter),
      ...collectMountedRoutes('/api/a2a/connectors/claude', claudeConnectorRouter),
      ...collectMountedRoutes('/api/a2a/connectors/codex', codexConnectorRouter),
      ...collectMountedRoutes('/api/a2a/context', contextBridgeRouter),
      ...collectMountedRoutes('/api/a2a', connectorHealthRouter),
      ...collectMountedRoutes('/api/a2a/patterns', patternRouter),
      ...collectMountedRoutes('/api/a2a', a2aOpenApiRouter),
    ]);

    const openApiPath = resolve(__dirname, '../../../docs/a2a-openapi.yaml');
    const documented = new Set(
      [...parseOpenApiRouteSet(readFileSync(openApiPath, 'utf8'))].filter(inPhase15Scope),
    );

    const undocumented = diff(mounted, documented);
    const stale = diff(documented, mounted);

    const messages: string[] = [];
    if (undocumented.length > 0) {
      messages.push(`Undocumented mounted routes:\n${undocumented.map((r) => `- ${r}`).join('\n')}`);
    }
    if (stale.length > 0) {
      messages.push(`Stale documented routes:\n${stale.map((r) => `- ${r}`).join('\n')}`);
    }

    expect(messages.join('\n\n')).toBe('');
  });
});
