export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'X-Recoder-Anonymous-Id',
];

export const CORS_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

export function getCorsHeadersForOrigin(origin: string | undefined, allowedOrigins: readonly string[]): Record<string, string> {
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

