// @ts-nocheck - Server-side only file
import { randomBytes } from 'crypto';
// Security utilities for Recoder Web

/**
 * Generate secure backup codes for 2FA
 * @returns Array of 8 backup codes
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  
  for (let i = 0; i < 8; i++) {
    // Generate 8-character alphanumeric codes
    const code = randomBytes(4).toString('hex').toUpperCase();
    // Format as XXXX-XXXX for better readability
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  
  return codes;
}

/**
 * Generate a secure API key
 * @param prefix Optional prefix for the key
 * @returns Secure API key string
 */
export function generateApiKey(prefix = 'rk'): string {
  // Generate 32 bytes of random data
  const randomData = randomBytes(32);
  
  // Convert to base64 and make URL-safe
  const key = randomData
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return `${prefix}_${key}`;
}

/**
 * Validate API key format
 * @param apiKey The API key to validate
 * @returns boolean indicating if the format is valid
 */
export function validateApiKeyFormat(apiKey: string): boolean {
  const apiKeyRegex = /^[a-z]+_[A-Za-z0-9_-]{40,}$/;
  return apiKeyRegex.test(apiKey);
}

/**
 * Hash an API key for storage
 * @param apiKey The API key to hash
 * @returns Hashed version for storage
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify an API key against its hash
 * @param apiKey The API key to verify
 * @param hash The stored hash to verify against
 * @returns boolean indicating if the key matches
 */
export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  const keyHash = await hashApiKey(apiKey);
  return keyHash === hash;
}

/**
 * Generate a secure session token
 * @param length Length of the token (default 32 bytes)
 * @returns Secure session token
 */
export function generateSessionToken(length = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Validate password strength
 * @param password The password to validate
 * @returns Object with validation result and requirements
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  score: number;
  requirements: {
    minLength: boolean;
    hasUpperCase: boolean;
    hasLowerCase: boolean;
    hasNumbers: boolean;
    hasSpecialChars: boolean;
    noCommonPatterns: boolean;
  };
  suggestions: string[];
} {
  const requirements = {
    minLength: password.length >= 8,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumbers: /\d/.test(password),
    hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    noCommonPatterns: !isCommonPassword(password),
  };

  const suggestions: string[] = [];
  
  if (!requirements.minLength) {
    suggestions.push('Use at least 8 characters');
  }
  if (!requirements.hasUpperCase) {
    suggestions.push('Include at least one uppercase letter');
  }
  if (!requirements.hasLowerCase) {
    suggestions.push('Include at least one lowercase letter');
  }
  if (!requirements.hasNumbers) {
    suggestions.push('Include at least one number');
  }
  if (!requirements.hasSpecialChars) {
    suggestions.push('Include at least one special character');
  }
  if (!requirements.noCommonPatterns) {
    suggestions.push('Avoid common passwords and patterns');
  }

  const score = Object.values(requirements).filter(Boolean).length;
  const isValid = score === Object.keys(requirements).length;

  return {
    isValid,
    score,
    requirements,
    suggestions,
  };
}

/**
 * Check if password is commonly used
 * @param password Password to check
 * @returns boolean indicating if password is common
 */
function isCommonPassword(password: string): boolean {
  const commonPasswords = [
    'password', '123456', '123456789', 'qwerty', 'abc123', 
    'password123', 'admin', 'letmein', 'welcome', 'monkey',
    'dragon', 'master', 'shadow', 'superman', 'michael',
    'football', 'baseball', 'liverpool', 'jordan', 'princess'
  ];
  
  const lowerPassword = password.toLowerCase();
  return commonPasswords.some(common => 
    lowerPassword.includes(common) || common.includes(lowerPassword)
  );
}

/**
 * Sanitize user input to prevent XSS
 * @param input User input string
 * @returns Sanitized string
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .trim()
    .substring(0, 1000); // Limit length
}

/**
 * Check if IP address is from a suspicious location/range
 * @param ip IP address to check
 * @returns boolean indicating if IP is suspicious
 */
export function isSuspiciousIP(ip: string): boolean {
  // Basic checks for suspicious IPs
  const suspiciousPatterns = [
    /^10\./, // Private network
    /^192\.168\./, // Private network  
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // Private network
    /^127\./, // Loopback
    /^0\./, // Invalid
  ];

  // In production, you'd also check against threat intelligence feeds
  return suspiciousPatterns.some(pattern => pattern.test(ip));
}

/**
 * Generate rate limiting key
 * @param identifier Base identifier
 * @param ip IP address
 * @returns Rate limiting key
 */
export function generateRateLimitKey(identifier: string, ip: string): string {
  return `${identifier}:${ip}`;
}

export default {
  generateBackupCodes,
  generateApiKey,
  validateApiKeyFormat,
  hashApiKey,
  verifyApiKey,
  generateSessionToken,
  validatePasswordStrength,
  sanitizeInput,
  isSuspiciousIP,
  generateRateLimitKey,
};