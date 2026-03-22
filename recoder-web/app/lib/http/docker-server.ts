const SESSION_COOKIE_NAMES = [
  '__Secure-recoder.session_token',
  'recoder.session_token',
  '__Secure-session_token',
  'session_token',
  'recoder_session_token',
];

export class DockerHttpError extends Error {
  public readonly status: number;
  public readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'DockerHttpError';
    this.status = status;
    this.payload = payload;
  }
}

export function getDockerBackendUrl(
  context?: unknown
): string {
  const env = (context as { cloudflare?: { env?: Record<string, string> } } | undefined)?.cloudflare?.env;
  return (
    env?.DOCKER_URL
    || env?.VITE_DOCKER_URL
    || env?.DOCKER_BACKEND_URL
    || env?.VITE_DOCKER_BACKEND_URL
    || process.env.DOCKER_URL
    || process.env.VITE_DOCKER_URL
    || process.env.DOCKER_BACKEND_URL
    || process.env.VITE_DOCKER_BACKEND_URL
    || 'https://docker.recoder.xyz'
  );
}

export function getSessionTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split('=');
    const value = valueParts.join('=');
    if (SESSION_COOKIE_NAMES.includes(name) && value) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

export function getBearerOrSessionTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  const bearerMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) {
    return bearerMatch[1].trim();
  }
  return getSessionTokenFromRequest(request);
}

export function createDockerAuthHeaders(
  request: Request,
  baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
): Record<string, string> {
  const headers = { ...baseHeaders };
  const token = getSessionTokenFromRequest(request);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function createDockerProxyHeaders(
  request: Request,
  baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
): Record<string, string> {
  const headers = { ...baseHeaders };
  const token = getBearerOrSessionTokenFromRequest(request);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function dockerFetchJson<T>(
  url: string,
  options: RequestInit = {},
  authHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let payload: unknown = null;
    try {
      payload = await response.json();
      const normalized = payload as { error?: string; message?: string };
      message = normalized.error || normalized.message || message;
    } catch {
      const text = await response.text().catch(() => '');
      if (text.trim()) {
        message = text.trim();
        payload = text;
      }
    }
    throw new DockerHttpError(message, response.status, payload);
  }

  return response.json() as Promise<T>;
}
