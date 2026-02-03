import type { WebhookVerificationResult } from './types';

/**
 * Compute HMAC-SHA256 signature for webhook verification
 */
async function computeHmacSha256(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(payload);

  // Import the secret key
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  // Sign the payload
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Compute HMAC-SHA1 signature for webhook verification (older GitHub webhooks)
 */
async function computeHmacSha1(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(payload);

  // Import the secret key
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);

  // Sign the payload
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Verify GitHub webhook signature
 *
 * GitHub sends webhooks with either:
 * - X-Hub-Signature-256: sha256=<signature> (preferred)
 * - X-Hub-Signature: sha1=<signature> (legacy)
 *
 * @param payload - Raw webhook payload (string)
 * @param signature - The signature from the X-Hub-Signature-256 or X-Hub-Signature header
 * @param secret - The webhook secret configured in GitHub
 */
export async function verifyGitHubWebhook(
  payload: string,
  signature: string | null,
  secret: string
): Promise<WebhookVerificationResult> {
  if (!signature) {
    return {
      valid: false,
      error: 'Missing webhook signature header',
    };
  }

  if (!secret) {
    return {
      valid: false,
      error: 'Webhook secret not configured',
    };
  }

  try {
    // Parse the signature format
    const [algorithm, signatureHash] = signature.split('=');

    if (!algorithm || !signatureHash) {
      return {
        valid: false,
        error: 'Invalid signature format',
      };
    }

    let expectedSignature: string;

    if (algorithm === 'sha256') {
      expectedSignature = await computeHmacSha256(secret, payload);
    } else if (algorithm === 'sha1') {
      expectedSignature = await computeHmacSha1(secret, payload);
    } else {
      return {
        valid: false,
        error: `Unsupported signature algorithm: ${algorithm}`,
      };
    }

    // Use constant-time comparison to prevent timing attacks
    const isValid = secureCompare(expectedSignature, signatureHash);

    if (!isValid) {
      return {
        valid: false,
        error: 'Signature verification failed',
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Extract GitHub webhook event info from headers
 */
export interface GitHubWebhookHeaders {
  event: string | null;
  deliveryId: string | null;
  signature: string | null;
  signatureSha1: string | null;
  hookId: string | null;
  hookInstallationTargetId: string | null;
  hookInstallationTargetType: string | null;
}

/**
 * Parse GitHub webhook headers from a Request object
 */
export function parseGitHubWebhookHeaders(request: Request): GitHubWebhookHeaders {
  return {
    event: request.headers.get('X-GitHub-Event'),
    deliveryId: request.headers.get('X-GitHub-Delivery'),
    signature: request.headers.get('X-Hub-Signature-256'),
    signatureSha1: request.headers.get('X-Hub-Signature'),
    hookId: request.headers.get('X-GitHub-Hook-ID'),
    hookInstallationTargetId: request.headers.get('X-GitHub-Hook-Installation-Target-ID'),
    hookInstallationTargetType: request.headers.get('X-GitHub-Hook-Installation-Target-Type'),
  };
}

/**
 * Parse GitHub webhook headers from a Headers-like object (for use with various frameworks)
 */
export function parseGitHubWebhookHeadersFromMap(
  headers: Record<string, string | string[] | undefined> | Map<string, string>
): GitHubWebhookHeaders {
  const get = (key: string): string | null => {
    if (headers instanceof Map) {
      return headers.get(key) || null;
    }

    const value = headers[key];

    if (Array.isArray(value)) {
      return value[0] || null;
    }

    return value || null;
  };

  return {
    event: get('x-github-event') || get('X-GitHub-Event'),
    deliveryId: get('x-github-delivery') || get('X-GitHub-Delivery'),
    signature: get('x-hub-signature-256') || get('X-Hub-Signature-256'),
    signatureSha1: get('x-hub-signature') || get('X-Hub-Signature'),
    hookId: get('x-github-hook-id') || get('X-GitHub-Hook-ID'),
    hookInstallationTargetId:
      get('x-github-hook-installation-target-id') || get('X-GitHub-Hook-Installation-Target-ID'),
    hookInstallationTargetType:
      get('x-github-hook-installation-target-type') || get('X-GitHub-Hook-Installation-Target-Type'),
  };
}

/**
 * Validate that a webhook request is from GitHub
 *
 * This performs comprehensive validation:
 * 1. Verifies required headers are present
 * 2. Verifies the webhook signature
 * 3. Returns the parsed webhook information
 */
export async function validateGitHubWebhook(
  request: Request,
  secret: string
): Promise<{
  valid: boolean;
  error?: string;
  headers?: GitHubWebhookHeaders;
  payload?: unknown;
}> {
  const headers = parseGitHubWebhookHeaders(request);

  // Check required headers
  if (!headers.event) {
    return {
      valid: false,
      error: 'Missing X-GitHub-Event header',
    };
  }

  if (!headers.deliveryId) {
    return {
      valid: false,
      error: 'Missing X-GitHub-Delivery header',
    };
  }

  // Get the raw body for signature verification
  const body = await request.text();

  if (!body) {
    return {
      valid: false,
      error: 'Empty request body',
    };
  }

  // Verify signature (prefer SHA-256, fall back to SHA-1)
  const signature = headers.signature || headers.signatureSha1;
  const verificationResult = await verifyGitHubWebhook(body, signature, secret);

  if (!verificationResult.valid) {
    return {
      valid: false,
      error: verificationResult.error,
    };
  }

  // Parse the JSON payload
  let payload: unknown;

  try {
    payload = JSON.parse(body);
  } catch {
    return {
      valid: false,
      error: 'Invalid JSON payload',
    };
  }

  return {
    valid: true,
    headers,
    payload,
  };
}

/**
 * Create a webhook response for GitHub
 *
 * GitHub expects a 2xx response to acknowledge receipt
 */
export function createWebhookResponse(
  status: 'accepted' | 'rejected' | 'error',
  message?: string
): Response {
  const statusCode = status === 'accepted' ? 200 : status === 'rejected' ? 400 : 500;

  return new Response(
    JSON.stringify({
      status,
      message: message || (status === 'accepted' ? 'Webhook received' : 'Webhook processing failed'),
    }),
    {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}
