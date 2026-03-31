import { getSessionAccessToken } from '@/lib/auth/session-token';

const SANDBOX_FILE_PROXY_PATH = '/api/files/content';

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
 * Fetch an HTML file from the sandbox and return a blob URL suitable for iframe src.
 * This bypasses the iframe auth problem: browsers can't send Bearer tokens via iframe src,
 * so we fetch the content via JS with auth headers and create a blob URL.
 */
export async function fetchSandboxHtmlAsBlobUrl(
  url: string,
): Promise<string | null> {
  try {
    const response = await fetchSandboxFile(url);
    if (!response.ok) return null;
    const html = await response.text();
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
