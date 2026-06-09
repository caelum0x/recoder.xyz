export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'X-Recoder-Anonymous-Id',
];

export const CORS_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

/**
 * Strict origin allowlist shared across CORS middleware and error handlers.
 * Centralised here so globalErrorHandler can emit the same headers as the
 * happy-path middleware — fixing the bug where 403/500 responses were missing
 * Access-Control-Allow-Origin and browsers couldn't read error bodies.
 */
export const ALLOWED_ORIGINS: readonly string[] = [
  'https://recoder.xyz',
  'https://www.recoder.xyz',
  'https://agents.recoder.xyz',
  'https://app.recoder.xyz',
  'https://agency.recoder.xyz',
  'https://pm.recoder.xyz',
  'https://docker.recoder.xyz',
  ...(process.env.NODE_ENV === 'production'
    ? []
    : [
        'http://localhost:3000',
        'http://localhost:3100',
      ]),
];

export function getCorsHeadersForOrigin(origin: string | undefined, allowedOrigins: readonly string[] = ALLOWED_ORIGINS): Record<string, string> {
  if (!origin || !allowedOrigins.includes(origin)) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': CORS_ALLOWED_METHODS.join(', '),
    'Access-Control-Allow-Headers': CORS_ALLOWED_HEADERS.join(', '),
    Vary: 'Origin',
  };
}
