import { getSessionAccessToken } from '@/lib/auth/session-token';

const SANDBOX_FILE_PROXY_PATH = '/api/files/content';
const SANDBOX_PREVIEW_DOMAIN = 'sandbox.recoder.xyz';

function extractSandboxPathFromUrl(filePath: string): string {
  if (!filePath.includes('://') && !filePath.includes('/sandboxes/') && !filePath.includes('/files/content')) {
    return filePath;
  }

  try {
    if (filePath.includes('://')) {
      const parsed = new URL(filePath);
      const pathParam = parsed.searchParams.get('path');
      if (pathParam) return decodeURIComponent(pathParam);
    }

    const pathMatch = filePath.match(/[?&]path=([^&]+)/);
    if (pathMatch) {
      return decodeURIComponent(pathMatch[1]);
    }
  } catch {
    // Fall through and return the original path.
  }

  return filePath;
}

function normalizeSandboxFilePath(filePath: string): string {
  let processedPath = extractSandboxPathFromUrl(filePath).trim();

  processedPath = processedPath.replace(/^\/workspace\//, '');

  if (!processedPath.startsWith('/home/daytona/') && !processedPath.startsWith('home/daytona/')) {
    processedPath = `/home/daytona/${processedPath.replace(/^\//, '')}`;
  } else if (!processedPath.startsWith('/')) {
    processedPath = `/${processedPath}`;
  }

  return processedPath;
}

/**
 * Build a same-origin URL for sandbox file content.
 * Agents proxies this through /api/files/content so the browser can rely on
 * the session cookie instead of making cross-origin sandbox/API requests.
 */
export function buildSandboxFileUrl(
  sandboxId: string | undefined,
  filePath: string | undefined,
): string | undefined {
  if (!sandboxId || !filePath) return undefined;

  const params = new URLSearchParams({
    sandboxId,
    path: normalizeSandboxFilePath(filePath),
  });

  return `${SANDBOX_FILE_PROXY_PATH}?${params.toString()}`;
}

/**
 * Append or replace a search parameter on either absolute URLs or same-origin
 * relative URLs without corrupting existing encoded query params.
 */
export function appendUrlSearchParam(
  url: string | undefined,
  key: string,
  value: string | number,
): string | undefined {
  if (!url) return undefined;

  try {
    const isAbsolute = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
    const parsed = new URL(url, isAbsolute ? undefined : 'https://placeholder.invalid');
    parsed.searchParams.set(key, String(value));

    if (isAbsolute) {
      return parsed.toString();
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
  }
}

/**
 * Build auth headers for sandbox file requests.
 * Returns headers object with Bearer token if available.
 */
export async function getSandboxAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    const token = await getSessionAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // Fall back to cookie-based auth
  }
  return headers;
}

/**
 * Fetch sandbox file content with authentication.
 * The primary path is same-origin cookie auth through the agents proxy;
 * the Bearer token is kept as a fallback for callers that still need it.
 */
export async function fetchSandboxFile(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const authHeaders = await getSandboxAuthHeaders();
  return fetch(url, {
    ...options,
    headers: {
      ...authHeaders,
      ...(options.headers as Record<string, string>),
    },
    credentials: 'include',
  });
}

/**
 * Resolve a relative or sandbox-absolute asset path to a normalized absolute
 * sandbox path (rooted at /home/daytona/...).
 * Returns null for external URLs (http/https/data/blob/protocol-relative).
 */
function resolveToSandboxPath(src: string, fileDir: string): string | null {
  if (
    !src ||
    src.startsWith('data:') ||
    src.startsWith('http://') ||
    src.startsWith('https://') ||
    src.startsWith('blob:') ||
    src.startsWith('//')
  ) {
    return null;
  }

  let absolutePath: string;

  if (src.startsWith('./') || src.startsWith('../') || !/^\//.test(src)) {
    // Relative path — resolve against the slide's directory
    const parts = `${fileDir}/${src}`.split('/');
    const resolved: string[] = [];
    for (const part of parts) {
      if (part === '..') {
        resolved.pop();
      } else if (part !== '.' && part !== '') {
        resolved.push(part);
      }
    }
    absolutePath = `/${resolved.join('/')}`;
  } else {
    // Absolute path within sandbox (e.g. /workspace/..., /home/daytona/..., /projects/...)
    absolutePath = src.replace(/^\/workspace\//, '');
    if (!absolutePath.startsWith('/home/daytona/')) {
      absolutePath = `/home/daytona${absolutePath}`;
    }
  }

  return absolutePath;
}

/**
 * Rewrite local asset references (img src, CSS url()) inside HTML to use the
 * same-origin sandbox file proxy.  Because the iframe has allow-same-origin,
 * these proxy requests carry session cookies automatically.
 */
function rewriteHtmlAssetPaths(
  html: string,
  sandboxId: string,
  fileDir: string,
): string {
  const makeProxyUrl = (resolvedPath: string) =>
    `${SANDBOX_FILE_PROXY_PATH}?${new URLSearchParams({ sandboxId, path: resolvedPath }).toString()}`;

  // Rewrite <img src="..."> and <source src="...">
  html = html.replace(
    /\b(src|href)=(["'])([^"']+)\2/gi,
    (match, attr, quote, src) => {
      // Only rewrite src/href that point to image/asset-like paths, skip page links
      const lower = src.toLowerCase();
      if (
        lower.endsWith('.html') ||
        lower.endsWith('.htm') ||
        lower.startsWith('#') ||
        lower.startsWith('javascript:') ||
        lower.startsWith('mailto:')
      ) {
        return match;
      }
      const resolved = resolveToSandboxPath(src, fileDir);
      if (!resolved) return match;
      return `${attr}=${quote}${makeProxyUrl(resolved)}${quote}`;
    },
  );

  // Rewrite CSS url(...) for background images etc.
  html = html.replace(/\burl\((["']?)([^"')]+)\1\)/gi, (match, quote, src) => {
    const resolved = resolveToSandboxPath(src, fileDir);
    if (!resolved) return match;
    return `url(${quote}${makeProxyUrl(resolved)}${quote})`;
  });

  return html;
}

/**
 * Fetch an HTML file from the sandbox and return a blob URL suitable for iframe src.
 * This bypasses the iframe auth problem: browsers can't send Bearer tokens via iframe src,
 * so we fetch the content via JS with auth headers and create a blob URL.
 *
 * Local asset paths (img src, CSS url()) are rewritten to the same-origin proxy so
 * they load correctly inside the blob iframe (which has allow-same-origin set).
 */
export async function fetchSandboxHtmlAsBlobUrl(
  url: string,
): Promise<string | null> {
  try {
    const response = await fetchSandboxFile(url);
    if (!response.ok) return null;
    let html = await response.text();

    // Rewrite local asset paths so they resolve inside the blob iframe
    try {
      const parsed = typeof URL !== 'undefined' ? new URL(url, 'https://placeholder.invalid') : null;
      const sandboxId = parsed?.searchParams.get('sandboxId') ?? null;
      const rawPath = parsed?.searchParams.get('path') ?? null;

      if (sandboxId && rawPath) {
        const fileDir = rawPath.substring(0, rawPath.lastIndexOf('/'));
        html = rewriteHtmlAssetPaths(html, sandboxId, fileDir);
      }
    } catch {
      // If rewriting fails, continue with original HTML
    }

    const blob = new Blob([html], { type: 'text/html' });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * Constructs a preview URL for HTML files in the sandbox environment.
 * Properly handles URL encoding of file paths by encoding each path segment individually.
 *
 * @param sandboxUrl - The base URL of the sandbox
 * @param filePath - The path to the HTML file (can include /workspace/ prefix, or be a full API URL)
 * @returns The properly encoded preview URL, or undefined if inputs are invalid
 */
export function constructHtmlPreviewUrl(
  sandboxUrl: string | undefined,
  filePath: string | undefined,
): string | undefined {
  if (!sandboxUrl || !filePath) {
    return undefined;
  }

  let processedPath = filePath;

  // If filePath is a full URL (API endpoint), extract the path parameter
  if (filePath.includes('://') || filePath.includes('/sandboxes/') || filePath.includes('/files/content')) {
    try {
      // Try to parse as URL if it's a full URL
      if (filePath.includes('://')) {
        const url = new URL(filePath);
        const pathParam = url.searchParams.get('path');
        if (pathParam) {
          processedPath = decodeURIComponent(pathParam);
        } else {
          // If no path param, try to extract from pathname
          // Handle patterns like /v1/sandboxes/.../files/content?path=...
          const pathMatch = filePath.match(/[?&]path=([^&]+)/);
          if (pathMatch) {
            processedPath = decodeURIComponent(pathMatch[1]);
          } else {
            // If it's a relative URL with /sandboxes/ pattern, extract the path
            const sandboxMatch = filePath.match(/\/sandboxes\/[^\/]+\/files\/content[?&]path=([^&]+)/);
            if (sandboxMatch) {
              processedPath = decodeURIComponent(sandboxMatch[1]);
            } else {
              // Can't extract path, return undefined
              return undefined;
            }
          }
        }
      } else {
        // Relative URL pattern: /sandboxes/.../files/content?path=...
        const pathMatch = filePath.match(/[?&]path=([^&]+)/);
        if (pathMatch) {
          processedPath = decodeURIComponent(pathMatch[1]);
        } else {
          // Can't extract path, return undefined
          return undefined;
        }
      }
    } catch {
      // URL parsing failed — treat as regular path
    }
  }

  // Remove /workspace/ prefix if present
  processedPath = processedPath.replace(/^\/workspace\//, '');

  // Split the path into segments and encode each segment individually
  const pathSegments = processedPath
    .split('/')
    .filter(Boolean) // Remove empty segments
    .map((segment) => encodeURIComponent(segment));

  // Join the segments back together with forward slashes
  const encodedPath = pathSegments.join('/');

  return `${sandboxUrl}/${encodedPath}`;
}

function extractSandboxIdFromReference(reference: string | undefined): string | undefined {
  const trimmed = reference?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (!trimmed.includes('://') && !trimmed.includes('/')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const hostMatch = parsed.hostname.match(new RegExp(`^(?:\\d+)-([^.]+)\\.${SANDBOX_PREVIEW_DOMAIN}$`, 'i'));
    if (hostMatch?.[1]) {
      return hostMatch[1];
    }
  } catch {
    const textMatch = trimmed.match(new RegExp(`(?:^|//)(?:\\d+)-([^.]+)\\.${SANDBOX_PREVIEW_DOMAIN}`, 'i'));
    if (textMatch?.[1]) {
      return textMatch[1];
    }
  }

  return undefined;
}

export function buildSandboxPortPreviewUrl(
  sandboxReference: string | undefined,
  port: number,
): string | undefined {
  if (!Number.isFinite(port) || port <= 0) {
    return undefined;
  }

  const sandboxId = extractSandboxIdFromReference(sandboxReference);
  if (!sandboxId) {
    return undefined;
  }

  return `https://${port}-${sandboxId}.${SANDBOX_PREVIEW_DOMAIN}`;
}

type AppPreviewFramework = 'nextjs' | 'vite' | 'react' | 'generic';

const APP_PREVIEW_PORTS: Record<AppPreviewFramework, number[]> = {
  nextjs: [3000, 3001],
  vite: [5173, 4173, 3000, 3001],
  react: [3000, 5173, 4173, 8080],
  generic: [3000, 8000, 8080, 5173],
};

export function buildProjectAppPreviewUrl(options: {
  sandboxId?: string;
  sandboxUrl?: string;
  framework?: AppPreviewFramework;
  exposedPorts?: Array<{ port?: number; url?: string }>;
}): string | undefined {
  const framework = options.framework ?? 'generic';
  const preferredPorts = APP_PREVIEW_PORTS[framework];

  if (Array.isArray(options.exposedPorts)) {
    const exposedByPort = new Map<number, string>();
    for (const entry of options.exposedPorts) {
      if (entry?.port && entry?.url) {
        exposedByPort.set(entry.port, entry.url);
      }
    }

    for (const port of preferredPorts) {
      const exposedUrl = exposedByPort.get(port);
      if (exposedUrl) {
        return exposedUrl;
      }
    }
  }

  const sandboxReference = options.sandboxId || options.sandboxUrl;
  for (const port of preferredPorts) {
    const previewUrl = buildSandboxPortPreviewUrl(sandboxReference, port);
    if (previewUrl) {
      return previewUrl;
    }
  }

  return framework === 'generic' ? options.sandboxUrl : undefined;
}
