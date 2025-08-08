/**
 * Browser-safe stub for kilocode token utilities
 * These utilities are primarily for server-side operations
 */

export function getKiloBaseUriFromToken(token: string): string {
  // Return a default base URI for browser environments
  // Real token parsing should happen on the server side
  return 'https://api.kilocode.com';
}

export function parseKilocodeToken(token: string): any {
  // Stub implementation for browser environments
  // Real token parsing should happen on the server side
  return {
    baseUrl: 'https://api.kilocode.com',
    userId: 'browser-user',
    valid: false
  };
}

export function validateKilocodeToken(token: string): boolean {
  // Stub implementation for browser environments
  // Real token validation should happen on the server side
  return false;
}