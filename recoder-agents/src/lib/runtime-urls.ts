import { RECODER_ECOSYSTEM_URLS } from '@recoder/ecosystem-config';

const PRODUCTION_AGENTS_URL = 'https://agents.recoder.xyz';
const PRODUCTION_BACKEND_API_URL = 'https://api.recoder.xyz/v1';
const PRODUCTION_DOCKER_BACKEND_URL = 'https://docker.recoder.xyz';
const BACKEND_PROXY_PATH = '/v1';

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function resolveAgentsSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_URL ||
    PRODUCTION_AGENTS_URL
  );
}

export function resolveAuthBaseUrl(): string {
  return process.env.NEXT_PUBLIC_AUTH_URL || RECODER_ECOSYSTEM_URLS.home;
}

export function resolveBackendApiUrl(): string {
  return trimTrailingSlash(
    process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || PRODUCTION_BACKEND_API_URL,
  );
}

/**
 * Resolve the browser-facing HTTP base URL for backend API calls.
 *
 * In the browser, this points at the same-origin `/v1` proxy so requests avoid
 * direct cross-origin calls to `api.recoder.xyz`. On the server, it falls back
 * to the direct backend URL.
 *
 * This helper is only for HTTP/SSE fetches. WebSocket callers should keep using
 * `resolveBackendApiUrl()` so they connect to the real backend host.
 */
export function resolveBrowserBackendApiUrl(): string {
  if (typeof window !== 'undefined') {
    return `${trimTrailingSlash(window.location.origin)}${BACKEND_PROXY_PATH}`;
  }

  return resolveBackendApiUrl();
}

export function resolveDockerBackendUrl(): string {
  return process.env.NEXT_PUBLIC_DOCKER_BACKEND_URL || PRODUCTION_DOCKER_BACKEND_URL;
}
