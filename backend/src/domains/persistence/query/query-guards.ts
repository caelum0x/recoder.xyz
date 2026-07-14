/**
 * Query security guards — PORTED from the vetted analysis in the legacy
 * `backend/src/database/query-executor.ts` (see its SECURITY_AUDIT.md). Pure
 * functions, no state: injection-pattern detection, parameter-type validation,
 * and error-message sanitization so internal details never leak to a caller.
 */

const MAX_PARAMS = 1000;

/** Patterns that may indicate an injection attempt (advisory, not a hard block). */
const SUSPICIOUS_PATTERNS: readonly RegExp[] = [
  /;\s*--/i, // statement terminator followed by comment
  /\/\*[\s\S]*?\*\//g, // block comments
  /UNION\s+(ALL\s+)?SELECT/i,
  /INTO\s+OUTFILE/i,
  /INTO\s+DUMPFILE/i,
  /LOAD_FILE\s*\(/i,
  /SLEEP\s*\(/i,
  /BENCHMARK\s*\(/i,
  /WAITFOR\s+DELAY/i,
  /PG_SLEEP\s*\(/i,
  /;\s*DROP\s+/i,
  /;\s*DELETE\s+/i,
  /;\s*TRUNCATE\s+/i,
  /EXEC\s*\(/i,
  /EXECUTE\s+IMMEDIATE/i,
];

export interface QueryAnalysis {
  readonly isSelect: boolean;
  readonly isModifying: boolean;
  readonly isDDL: boolean;
  readonly suspicious: boolean;
  readonly warnings: readonly string[];
}

/** Classify a (already positional) query and flag suspicious constructs. */
export function analyzeQuery(query: string): QueryAnalysis {
  const warnings: string[] = [];
  let suspicious = false;
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(query)) {
      suspicious = true;
      warnings.push(`suspicious pattern: ${pattern.source}`);
    }
  }
  return {
    isSelect: /^\s*SELECT\b/i.test(query),
    isModifying: /^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(query),
    isDDL: /^\s*(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i.test(query),
    suspicious,
    warnings,
  };
}

/** Reject param values of unsupported types before they reach the driver. */
export function validateParamValues(params: readonly unknown[]): { valid: boolean; error?: string } {
  if (params.length > MAX_PARAMS) {
    return { valid: false, error: `too many parameters (max ${MAX_PARAMS})` };
  }
  for (let i = 0; i < params.length; i++) {
    const param = params[i];
    const type = typeof param;
    if (
      param === null ||
      param === undefined ||
      type === 'string' ||
      type === 'number' ||
      type === 'boolean' ||
      type === 'bigint' ||
      param instanceof Date ||
      Buffer.isBuffer(param)
    ) {
      continue;
    }
    if (type === 'function' || type === 'symbol') {
      return { valid: false, error: `parameter ${i} has an unsupported type (${type})` };
    }
    if (type === 'object') {
      // Arrays (already expanded upstream) and plain JSON objects are allowed.
      if (Array.isArray(param) || (param as object).constructor === Object) continue;
      return { valid: false, error: `parameter ${i} has an unsupported object type` };
    }
  }
  return { valid: true };
}

/** Strip connection strings, IPs, paths, and passwords from an error message. */
export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  sanitized = sanitized.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[connection_string]');
  sanitized = sanitized.replace(/mysql:\/\/[^\s]+/gi, '[connection_string]');
  sanitized = sanitized.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[ip_address]');
  sanitized = sanitized.replace(/password[=:][^\s]+/gi, 'password=[hidden]');
  sanitized = sanitized.replace(/\/(?:[^\s/]+\/)+[^\s/]+/g, '[path]');
  return sanitized;
}
