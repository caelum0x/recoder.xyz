/**
 * Input Validation Utilities
 *
 * Provides validation functions for identity tokens, app keys, and related inputs.
 * All validation functions return { valid: boolean, error?: string }
 */
import type { IdentityTokenScope } from './types.js';
export interface ValidationResult {
    valid: boolean;
    error?: string;
}
/**
 * Valid identity token scopes
 */
export declare const VALID_IDENTITY_SCOPES: IdentityTokenScope[];
/**
 * Maximum lengths for various fields
 */
export declare const MAX_LENGTHS: {
    readonly audience: 256;
    readonly appKeyName: 100;
    readonly appKeyDescription: 500;
    readonly callbackUrl: 2048;
    readonly tokenString: 128;
};
/**
 * Patterns for validation
 */
export declare const PATTERNS: {
    readonly audience: RegExp;
    readonly identityToken: RegExp;
    readonly appKey: RegExp;
    readonly apiKey: RegExp;
    readonly safeString: RegExp;
    readonly url: RegExp;
};
/**
 * Validate audience string
 */
export declare function validateAudience(audience: unknown): ValidationResult;
/**
 * Validate identity token scopes
 */
export declare function validateScopes(scopes: unknown): ValidationResult;
/**
 * Validate identity token string format
 */
export declare function validateIdentityTokenFormat(token: unknown): ValidationResult;
/**
 * Validate app key name
 */
export declare function validateAppKeyName(name: unknown): ValidationResult;
/**
 * Validate app key description
 */
export declare function validateAppKeyDescription(description: unknown): ValidationResult;
/**
 * Validate callback URLs
 */
export declare function validateCallbackUrls(urls: unknown): ValidationResult;
/**
 * Validate Moltbook identity token
 */
export declare function validateMoltbookToken(token: unknown): ValidationResult;
/**
 * Validate UUID format
 */
export declare function validateUUID(id: unknown, fieldName?: string): ValidationResult;
/**
 * Combine multiple validation results
 */
export declare function combineValidations(...results: ValidationResult[]): ValidationResult;
/**
 * Sanitize a string for safe storage/display
 */
export declare function sanitizeString(input: string): string;
/**
 * Validate a project ID parameter (alphanumeric + hyphens)
 */
export declare function validateProjectId(projectId: unknown, fieldName?: string): ValidationResult;
/**
 * Validate a file path parameter (prevent path traversal)
 */
export declare function validateFilePath(filePath: unknown, fieldName?: string): ValidationResult;
/**
 * Validate a git branch name
 */
export declare function validateBranchName(branch: unknown, fieldName?: string): ValidationResult;
/**
 * Validate a git commit message
 */
export declare function validateCommitMessage(message: unknown, fieldName?: string): ValidationResult;
/**
 * Validate a git commit hash
 */
export declare function validateCommitHash(hash: unknown, fieldName?: string): ValidationResult;
/**
 * Validate a GitHub repository URL
 */
export declare function validateGitUrl(url: unknown, fieldName?: string): ValidationResult;
/**
 * Validate a domain name for custom domain feature
 */
export declare function validateDomainName(domain: unknown, fieldName?: string): ValidationResult;
/**
 * Validate a positive integer parameter
 */
export declare function validatePositiveInt(value: unknown, fieldName?: string, max?: number): ValidationResult;
