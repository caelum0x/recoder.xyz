/**
 * Platform URLs configuration
 * Handles environment-specific URLs for recoder platforms
 */

export function getRecoderWebUrl(): string {
  // Check environment variable first
  if (process.env.RECODER_WEB_URL) {
    return process.env.RECODER_WEB_URL;
  }

  // Check if we're in production or development
  if (process.env.NODE_ENV === 'production') {
    return 'https://web.recoder.xyz';
  }

  // Development: check for custom port
  const port = process.env.RECODER_WEB_PORT || '8788';
  return `http://localhost:${port}`;
}

export function getRecoderChatUrl(): string {
  if (process.env.RECODER_CHAT_URL) {
    return process.env.RECODER_CHAT_URL;
  }

  if (process.env.NODE_ENV === 'production') {
    return 'https://chat.recoder.xyz';
  }

  return 'http://localhost:3002';
}

export function getMainSiteUrl(): string {
  if (process.env.MAIN_SITE_URL) {
    return process.env.MAIN_SITE_URL;
  }

  if (process.env.NODE_ENV === 'production') {
    return 'https://recoder.xyz';
  }

  return 'http://localhost:3000';
}

/**
 * Get web IDE URL with optional path
 */
export function getWebIdeUrl(path: string = ''): string {
  const baseUrl = getRecoderWebUrl();
  return path ? `${baseUrl}${path}` : baseUrl;
}

/**
 * Client-side version (for use in client components)
 */
export function getRecoderWebUrlClient(): string {
  if (typeof window === 'undefined') {
    return getRecoderWebUrl();
  }

  // Check for environment variable (must use NEXT_PUBLIC_ prefix for client-side)
  if (process.env.NEXT_PUBLIC_RECODER_WEB_URL) {
    return process.env.NEXT_PUBLIC_RECODER_WEB_URL;
  }

  // Client-side: check hostname - if it's recoder.xyz, use production URL
  const hostname = window.location.hostname;
  if (hostname === 'recoder.xyz' || hostname === 'www.recoder.xyz') {
    return 'https://web.recoder.xyz';
  }

  // Local development
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5173';
  }

  // Default to production
  return 'https://web.recoder.xyz';
}
