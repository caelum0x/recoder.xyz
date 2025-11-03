/**
 * Production-Grade Request Validation
 * Sanitizes and validates all incoming requests
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: any;
}

/**
 * Validate and sanitize chat messages
 */
export function validateChatMessages(messages: any): ValidationResult {
  const errors: string[] = [];

  // Check if messages exist and is array
  if (!messages) {
    errors.push('Messages are required');
    return { valid: false, errors };
  }

  if (!Array.isArray(messages)) {
    errors.push('Messages must be an array');
    return { valid: false, errors };
  }

  // Validate array length
  if (messages.length === 0) {
    errors.push('Messages array cannot be empty');
    return { valid: false, errors };
  }

  if (messages.length > 100) {
    errors.push('Too many messages (max 100)');
    return { valid: false, errors };
  }

  // Validate each message
  const sanitizedMessages = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // Check message structure
    if (!msg || typeof msg !== 'object') {
      errors.push(`Message ${i} is invalid`);
      continue;
    }

    // Validate role
    if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) {
      errors.push(`Message ${i} has invalid role: ${msg.role}`);
      continue;
    }

    // Validate content
    if (typeof msg.content !== 'string') {
      errors.push(`Message ${i} content must be a string`);
      continue;
    }

    // Sanitize content length
    if (msg.content.length > 50000) {
      errors.push(`Message ${i} content too long (max 50000 characters)`);
      continue;
    }

    // Sanitize content (remove potential XSS)
    const sanitizedContent = sanitizeString(msg.content);

    sanitizedMessages.push({
      role: msg.role,
      content: sanitizedContent,
      ...(msg.toolInvocations && { toolInvocations: msg.toolInvocations }),
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    sanitized: sanitizedMessages,
  };
}

/**
 * Sanitize string input (basic XSS prevention)
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';

  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Limit excessive whitespace
  sanitized = sanitized.replace(/\s{100,}/g, ' '.repeat(100));

  return sanitized;
}

/**
 * Validate request headers
 */
export function validateHeaders(request: Request): ValidationResult {
  const errors: string[] = [];

  // Check content type for POST requests
  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type');

    if (!contentType || !contentType.includes('application/json')) {
      errors.push('Content-Type must be application/json');
    }
  }

  // Validate content length
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const length = parseInt(contentLength, 10);
    if (length > 10 * 1024 * 1024) { // 10MB limit
      errors.push('Request body too large (max 10MB)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate API key format (if using API keys)
 */
export function validateApiKey(apiKey: string | null): ValidationResult {
  const errors: string[] = [];

  if (!apiKey) {
    errors.push('API key is required');
    return { valid: false, errors };
  }

  // Check format (basic validation)
  if (apiKey.length < 20 || apiKey.length > 100) {
    errors.push('Invalid API key format');
    return { valid: false, errors };
  }

  // Check for valid characters
  if (!/^[A-Za-z0-9_-]+$/.test(apiKey)) {
    errors.push('API key contains invalid characters');
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    sanitized: apiKey,
  };
}

/**
 * Comprehensive request validation
 */
export async function validateRequest(
  request: Request,
  options: {
    requireAuth?: boolean;
    maxBodySize?: number;
  } = {}
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Validate method
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) {
    errors.push(`Invalid HTTP method: ${request.method}`);
  }

  // Validate headers
  const headerValidation = validateHeaders(request);
  if (!headerValidation.valid) {
    errors.push(...headerValidation.errors);
  }

  // Validate authentication if required
  if (options.requireAuth) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      errors.push('Authentication required');
    } else if (!authHeader.startsWith('Bearer ')) {
      errors.push('Invalid authorization header format');
    }
  }

  // Check for common attack patterns in URL
  const url = new URL(request.url);
  if (containsSuspiciousPatterns(url.pathname + url.search)) {
    errors.push('Suspicious request pattern detected');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check for common attack patterns
 */
function containsSuspiciousPatterns(input: string): boolean {
  const suspiciousPatterns = [
    /\.\.\//g,           // Path traversal
    /<script/gi,         // XSS
    /javascript:/gi,     // XSS
    /on\w+\s*=/gi,      // Event handlers
    /eval\(/gi,          // Code injection
    /union\s+select/gi,  // SQL injection
    /base64/gi,          // Potential obfuscation
  ];

  return suspiciousPatterns.some(pattern => pattern.test(input));
}

/**
 * Create validation error response
 */
export function createValidationErrorResponse(errors: string[]): Response {
  return new Response(
    JSON.stringify({
      error: 'Validation failed',
      details: errors,
    }),
    {
      status: 400,
      statusText: 'Bad Request',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}
