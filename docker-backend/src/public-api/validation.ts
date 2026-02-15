/**
 * Input Validation Utilities
 *
 * Provides validation functions for identity tokens, app keys, and related inputs.
 * All validation functions return { valid: boolean, error?: string }
 */

import type { IdentityTokenScope } from './types.js';

// ==================== Types ====================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// ==================== Constants ====================

/**
 * Valid identity token scopes
 */
export const VALID_IDENTITY_SCOPES: IdentityTokenScope[] = [
  'profile:read',
  'projects:read',
  'usage:read',
];

/**
 * Maximum lengths for various fields
 */
export const MAX_LENGTHS = {
  audience: 256,
  appKeyName: 100,
  appKeyDescription: 500,
  callbackUrl: 2048,
  tokenString: 128,
} as const;

/**
 * Patterns for validation
 */
export const PATTERNS = {
  // Audience: domain-like or URL-like string
  audience: /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/,
  // Identity token format: idt_{base64url}
  identityToken: /^idt_[A-Za-z0-9_-]{20,64}$/,
  // App key format: app_{prefix}_{random}
  appKey: /^app_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{20,32}$/,
  // API key format: sk_{env}_{prefix}_{random}
  apiKey: /^sk_(live|test)_[A-Za-z0-9_-]+$/,
  // Safe string (no control characters or dangerous chars)
  safeString: /^[^\x00-\x1f\x7f<>]*$/,
  // URL pattern
  url: /^https?:\/\/[^\s<>]+$/,
} as const;

// ==================== Validation Functions ====================

/**
 * Validate audience string
 */
export function validateAudience(audience: unknown): ValidationResult {
  if (audience === undefined || audience === null) {
    return { valid: true }; // Optional field
  }

  if (typeof audience !== 'string') {
    return { valid: false, error: 'audience must be a string' };
  }

  if (audience.length === 0) {
    return { valid: true }; // Empty string is ok (treated as no audience)
  }

  if (audience.length > MAX_LENGTHS.audience) {
    return { valid: false, error: `audience must be at most ${MAX_LENGTHS.audience} characters` };
  }

  if (!PATTERNS.audience.test(audience)) {
    return { valid: false, error: 'audience must be a valid domain or identifier (alphanumeric, dots, hyphens)' };
  }

  return { valid: true };
}

/**
 * Validate identity token scopes
 */
export function validateScopes(scopes: unknown): ValidationResult {
  if (scopes === undefined || scopes === null) {
    return { valid: true }; // Optional field, defaults will be used
  }

  if (!Array.isArray(scopes)) {
    return { valid: false, error: 'scopes must be an array' };
  }

  if (scopes.length === 0) {
    return { valid: true }; // Empty array is ok, defaults will be used
  }

  if (scopes.length > VALID_IDENTITY_SCOPES.length) {
    return { valid: false, error: `scopes must have at most ${VALID_IDENTITY_SCOPES.length} items` };
  }

  for (const scope of scopes) {
    if (typeof scope !== 'string') {
      return { valid: false, error: 'each scope must be a string' };
    }
    if (!VALID_IDENTITY_SCOPES.includes(scope as IdentityTokenScope)) {
      return { valid: false, error: `invalid scope: ${scope}. Valid scopes: ${VALID_IDENTITY_SCOPES.join(', ')}` };
    }
  }

  // Check for duplicates
  const uniqueScopes = new Set(scopes);
  if (uniqueScopes.size !== scopes.length) {
    return { valid: false, error: 'scopes must not contain duplicates' };
  }

  return { valid: true };
}

/**
 * Validate identity token string format
 */
export function validateIdentityTokenFormat(token: unknown): ValidationResult {
  if (token === undefined || token === null) {
    return { valid: false, error: 'token is required' };
  }

  if (typeof token !== 'string') {
    return { valid: false, error: 'token must be a string' };
  }

  if (token.length === 0) {
    return { valid: false, error: 'token cannot be empty' };
  }

  if (token.length > MAX_LENGTHS.tokenString) {
    return { valid: false, error: 'token is too long' };
  }

  if (!token.startsWith('idt_')) {
    return { valid: false, error: 'invalid token format' };
  }

  return { valid: true };
}

/**
 * Validate app key name
 */
export function validateAppKeyName(name: unknown): ValidationResult {
  if (name === undefined || name === null) {
    return { valid: false, error: 'name is required' };
  }

  if (typeof name !== 'string') {
    return { valid: false, error: 'name must be a string' };
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'name cannot be empty' };
  }

  if (trimmed.length > MAX_LENGTHS.appKeyName) {
    return { valid: false, error: `name must be at most ${MAX_LENGTHS.appKeyName} characters` };
  }

  if (!PATTERNS.safeString.test(trimmed)) {
    return { valid: false, error: 'name contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate app key description
 */
export function validateAppKeyDescription(description: unknown): ValidationResult {
  if (description === undefined || description === null) {
    return { valid: true }; // Optional field
  }

  if (typeof description !== 'string') {
    return { valid: false, error: 'description must be a string' };
  }

  if (description.length > MAX_LENGTHS.appKeyDescription) {
    return { valid: false, error: `description must be at most ${MAX_LENGTHS.appKeyDescription} characters` };
  }

  if (!PATTERNS.safeString.test(description)) {
    return { valid: false, error: 'description contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate callback URLs
 */
export function validateCallbackUrls(urls: unknown): ValidationResult {
  if (urls === undefined || urls === null) {
    return { valid: true }; // Optional field
  }

  if (!Array.isArray(urls)) {
    return { valid: false, error: 'allowedCallbackUrls must be an array' };
  }

  if (urls.length > 10) {
    return { valid: false, error: 'allowedCallbackUrls must have at most 10 URLs' };
  }

  for (const url of urls) {
    if (typeof url !== 'string') {
      return { valid: false, error: 'each callback URL must be a string' };
    }

    if (url.length > MAX_LENGTHS.callbackUrl) {
      return { valid: false, error: `callback URL must be at most ${MAX_LENGTHS.callbackUrl} characters` };
    }

    if (!PATTERNS.url.test(url)) {
      return { valid: false, error: `invalid callback URL: ${url}` };
    }

    // Must be HTTPS in production
    if (process.env.NODE_ENV === 'production' && !url.startsWith('https://')) {
      return { valid: false, error: 'callback URLs must use HTTPS in production' };
    }
  }

  return { valid: true };
}

/**
 * Validate Moltbook identity token
 */
export function validateMoltbookToken(token: unknown): ValidationResult {
  if (token === undefined || token === null) {
    return { valid: false, error: 'identity_token is required' };
  }

  if (typeof token !== 'string') {
    return { valid: false, error: 'identity_token must be a string' };
  }

  if (token.length === 0) {
    return { valid: false, error: 'identity_token cannot be empty' };
  }

  if (token.length > 2048) {
    return { valid: false, error: 'identity_token is too long' };
  }

  // Basic format check - Moltbook tokens should have a recognizable format
  // In production, actual validation happens via Moltbook API
  if (!PATTERNS.safeString.test(token)) {
    return { valid: false, error: 'identity_token contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate UUID format
 */
export function validateUUID(id: unknown, fieldName: string = 'id'): ValidationResult {
  if (id === undefined || id === null) {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (typeof id !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  // UUID v4 pattern or jti_ prefixed
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const jtiPattern = /^jti_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(id) && !jtiPattern.test(id)) {
    return { valid: false, error: `${fieldName} must be a valid UUID` };
  }

  return { valid: true };
}

/**
 * Combine multiple validation results
 */
export function combineValidations(...results: ValidationResult[]): ValidationResult {
  for (const result of results) {
    if (!result.valid) {
      return result;
    }
  }
  return { valid: true };
}

/**
 * Sanitize a string for safe storage/display
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[\x00-\x1f\x7f]/g, '') // Remove control characters
    .trim();
}

// ==================== API Endpoint Validation ====================

/**
 * Validate a project ID parameter (alphanumeric + hyphens)
 */
export function validateProjectId(projectId: unknown, fieldName = 'projectId'): ValidationResult {
  if (projectId === undefined || projectId === null) {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (typeof projectId !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  if (projectId.length === 0 || projectId.length > 128) {
    return { valid: false, error: `${fieldName} must be 1-128 characters` };
  }

  // Allow UUID format, alphanumeric, hyphens, underscores
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(projectId)) {
    return { valid: false, error: `${fieldName} contains invalid characters` };
  }

  return { valid: true };
}

/**
 * Validate a file path parameter (prevent path traversal)
 */
export function validateFilePath(filePath: unknown, fieldName = 'path'): ValidationResult {
  if (filePath === undefined || filePath === null) {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (typeof filePath !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  if (filePath.length === 0 || filePath.length > 4096) {
    return { valid: false, error: `${fieldName} must be 1-4096 characters` };
  }

  // Block path traversal
  if (filePath.includes('..') || filePath.includes('\0')) {
    return { valid: false, error: `${fieldName} contains invalid path sequence` };
  }

  return { valid: true };
}

/**
 * Validate a git branch name
 */
export function validateBranchName(branch: unknown, fieldName = 'branch'): ValidationResult {
  if (branch === undefined || branch === null) {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (typeof branch !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  const trimmed = branch.trim();
  if (trimmed.length === 0 || trimmed.length > 256) {
    return { valid: false, error: `${fieldName} must be 1-256 characters` };
  }

  // Git branch name rules: no spaces, no .., no control chars, no ~^:?\[
  if (/[\x00-\x1f\x7f ~^:?\\*\[]/.test(trimmed) || trimmed.includes('..')) {
    return { valid: false, error: `${fieldName} contains invalid characters for a git branch name` };
  }

  // Cannot start/end with dot or slash
  if (/^[./]|[./]$/.test(trimmed)) {
    return { valid: false, error: `${fieldName} cannot start or end with '.' or '/'` };
  }

  // Cannot end with .lock
  if (trimmed.endsWith('.lock')) {
    return { valid: false, error: `${fieldName} cannot end with '.lock'` };
  }

  return { valid: true };
}

/**
 * Validate a git commit message
 */
export function validateCommitMessage(message: unknown, fieldName = 'message'): ValidationResult {
  if (message === undefined || message === null) {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (typeof message !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  if (message.trim().length === 0) {
    return { valid: false, error: `${fieldName} cannot be empty` };
  }

  if (message.length > 10000) {
    return { valid: false, error: `${fieldName} must be at most 10000 characters` };
  }

  return { valid: true };
}

/**
 * Validate a git commit hash
 */
export function validateCommitHash(hash: unknown, fieldName = 'commitHash'): ValidationResult {
  if (hash === undefined || hash === null) {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (typeof hash !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  // Full or abbreviated SHA-1/SHA-256
  if (!/^[0-9a-f]{7,64}$/i.test(hash)) {
    return { valid: false, error: `${fieldName} must be a valid git commit hash` };
  }

  return { valid: true };
}

/**
 * Validate a GitHub repository URL
 */
export function validateGitUrl(url: unknown, fieldName = 'url'): ValidationResult {
  if (url === undefined || url === null) {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (typeof url !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  if (url.length > 2048) {
    return { valid: false, error: `${fieldName} is too long` };
  }

  // Allow HTTPS GitHub URLs or git@ SSH URLs
  if (
    !url.startsWith('https://github.com/') &&
    !url.startsWith('https://gitlab.com/') &&
    !url.startsWith('git@github.com:') &&
    !url.startsWith('git@gitlab.com:')
  ) {
    return { valid: false, error: `${fieldName} must be a valid GitHub or GitLab repository URL` };
  }

  return { valid: true };
}

/**
 * Validate a domain name for custom domain feature
 */
export function validateDomainName(domain: unknown, fieldName = 'domain'): ValidationResult {
  if (domain === undefined || domain === null) {
    return { valid: false, error: `${fieldName} is required` };
  }

  if (typeof domain !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }

  const trimmed = domain.trim().toLowerCase();

  if (trimmed.length === 0 || trimmed.length > 253) {
    return { valid: false, error: `${fieldName} must be 1-253 characters` };
  }

  // Basic domain validation
  const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
  if (!domainPattern.test(trimmed)) {
    return { valid: false, error: `${fieldName} must be a valid domain name` };
  }

  // Block our own domains to prevent confusion
  const blockedDomains = ['recoder.xyz', 'www.recoder.xyz', 'api.recoder.xyz', 'docker.recoder.xyz'];
  if (blockedDomains.includes(trimmed) || trimmed.endsWith('.recoder.xyz')) {
    return { valid: false, error: `${fieldName} cannot be a recoder.xyz subdomain` };
  }

  return { valid: true };
}

/**
 * Validate a positive integer parameter
 */
export function validatePositiveInt(value: unknown, fieldName = 'value', max = 10000): ValidationResult {
  if (value === undefined || value === null) {
    return { valid: true }; // Optional
  }

  const num = typeof value === 'string' ? parseInt(value, 10) : value;

  if (typeof num !== 'number' || isNaN(num)) {
    return { valid: false, error: `${fieldName} must be a number` };
  }

  if (num < 0 || num > max) {
    return { valid: false, error: `${fieldName} must be between 0 and ${max}` };
  }

  return { valid: true };
}
