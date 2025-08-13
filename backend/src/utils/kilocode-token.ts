export interface KilocodeToken {
  token: string;
  expiresAt: Date;
  userId?: string;
  scopes?: string[];
}

export function generateKilocodeToken(userId?: string, scopes?: string[]): KilocodeToken {
  // Generate a simple token - in production, use proper JWT or similar
  const token = `kilo_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  return {
    token,
    expiresAt,
    userId,
    scopes
  };
}

export function validateKilocodeToken(token: string): boolean {
  // Simple validation - in production, implement proper token validation
  return token.startsWith('kilo_') && token.length > 20;
}

export function parseKilocodeToken(token: string): Partial<KilocodeToken> | null {
  if (!validateKilocodeToken(token)) {
    return null;
  }

  // Simple parsing - in production, decode JWT or similar
  const parts = token.split('_');
  if (parts.length < 2) {
    return null;
  }

  const timestamp = parseInt(parts[1], 10);
  if (isNaN(timestamp)) {
    return null;
  }

  return {
    token,
    expiresAt: new Date(timestamp + 24 * 60 * 60 * 1000)
  };
}