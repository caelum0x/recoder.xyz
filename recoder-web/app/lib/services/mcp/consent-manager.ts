/**
 * MCP Consent Manager
 *
 * Handles consent requests for MCP tool execution.
 * Provides a promise-based API for waiting on user consent decisions.
 */

import type {
  McpConsentValue,
  McpConsentDecision,
  McpConsentRequest,
  McpConsentResponse,
  McpEventListener,
} from './types';
import { getStoredConsent, setStoredConsent } from './storage';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MCPConsentManager');

// =============================================================================
// Consent Resolution
// =============================================================================

interface PendingConsentResolver {
  resolve: (decision: McpConsentDecision) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  request: McpConsentRequest;
}

// Map of pending consent requests waiting for user decision
const pendingConsentResolvers = new Map<string, PendingConsentResolver>();

// Event listeners for consent requests (to show UI)
const consentEventListeners = new Set<McpEventListener>();

// Default timeout for consent requests (5 minutes)
const DEFAULT_CONSENT_TIMEOUT = 5 * 60 * 1000;

/**
 * Generate a unique request ID for consent
 */
function generateRequestId(serverId: string, toolName: string): string {
  const random = Math.random().toString(36).substring(2, 9);
  return `${serverId}:${toolName}:${Date.now()}-${random}`;
}

/**
 * Subscribe to consent events
 */
export function addConsentEventListener(listener: McpEventListener): () => void {
  consentEventListeners.add(listener);
  return () => consentEventListeners.delete(listener);
}

/**
 * Emit a consent event to all listeners
 */
function emitConsentEvent(event: Parameters<McpEventListener>[0]): void {
  consentEventListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (e) {
      logger.error('Consent event listener error:', e);
    }
  });
}

/**
 * Wait for user to make a consent decision
 * Returns a promise that resolves with the decision
 */
export function waitForConsent(
  requestId: string,
  timeout: number = DEFAULT_CONSENT_TIMEOUT
): Promise<McpConsentDecision> {
  return new Promise((resolve, reject) => {
    // Create timeout that will reject if user doesn't respond in time
    const timeoutId = setTimeout(() => {
      const pending = pendingConsentResolvers.get(requestId);
      if (pending) {
        pendingConsentResolvers.delete(requestId);
        reject(new Error(`Consent request timed out after ${timeout}ms`));
      }
    }, timeout);

    const existingPending = pendingConsentResolvers.get(requestId);
    if (existingPending) {
      // Already waiting, chain to existing
      clearTimeout(timeoutId);
      existingPending.resolve = (decision) => {
        resolve(decision);
        existingPending.resolve(decision);
      };
      return;
    }

    pendingConsentResolvers.set(requestId, {
      resolve,
      reject,
      timeout: timeoutId,
      request: { requestId } as McpConsentRequest,
    });
  });
}

/**
 * Resolve a pending consent request with a decision
 */
export function resolveConsent(requestId: string, decision: McpConsentDecision): void {
  const pending = pendingConsentResolvers.get(requestId);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingConsentResolvers.delete(requestId);
    pending.resolve(decision);

    // Emit response event
    emitConsentEvent({
      type: 'consent-response',
      response: { requestId, decision },
    });

    logger.debug(`Consent resolved for ${requestId}: ${decision}`);
  } else {
    logger.warn(`No pending consent request found for ${requestId}`);
  }
}

/**
 * Cancel all pending consent requests
 */
export function cancelAllPendingConsents(): void {
  pendingConsentResolvers.forEach((pending, requestId) => {
    clearTimeout(pending.timeout);
    pending.reject(new Error('Consent cancelled'));
  });
  pendingConsentResolvers.clear();
}

/**
 * Get number of pending consent requests
 */
export function getPendingConsentCount(): number {
  return pendingConsentResolvers.size;
}

/**
 * Get all pending consent requests
 */
export function getPendingConsentRequests(): McpConsentRequest[] {
  return Array.from(pendingConsentResolvers.values()).map((p) => p.request);
}

// =============================================================================
// Tool Consent Workflow
// =============================================================================

/**
 * Options for requesting tool consent
 */
export interface RequireConsentOptions {
  serverId: string;
  serverName: string;
  toolName: string;
  toolDescription?: string | null;
  inputPreview?: string | null;
  timeout?: number;
}

/**
 * Request consent for executing an MCP tool
 *
 * This function:
 * 1. Checks stored consent preferences
 * 2. If "always" - returns true immediately
 * 3. If "denied" - returns false immediately
 * 4. If "ask" - emits a consent request event and waits for user decision
 * 5. If user chooses "accept-always", stores the preference
 *
 * @returns true if consent granted, false if denied
 */
export async function requireMcpToolConsent(
  options: RequireConsentOptions
): Promise<boolean> {
  const {
    serverId,
    serverName,
    toolName,
    toolDescription,
    inputPreview,
    timeout = DEFAULT_CONSENT_TIMEOUT,
  } = options;

  // Check stored consent
  const storedConsent = getStoredConsent(serverId, toolName);

  if (storedConsent === 'always') {
    logger.debug(`Tool ${toolName} has stored "always" consent`);
    return true;
  }

  if (storedConsent === 'denied') {
    logger.debug(`Tool ${toolName} has stored "denied" consent`);
    return false;
  }

  // Need to ask user
  const requestId = generateRequestId(serverId, toolName);
  const request: McpConsentRequest = {
    requestId,
    serverId,
    serverName,
    toolName,
    toolDescription,
    inputPreview,
  };

  // Store the request for later access
  const pending = pendingConsentResolvers.get(requestId);
  if (pending) {
    pending.request = request;
  }

  // Emit consent request event (this should trigger UI)
  emitConsentEvent({
    type: 'consent-request',
    request,
  });

  logger.debug(`Requesting consent for tool ${toolName} from server ${serverName}`);

  try {
    // Wait for user decision
    const decision = await waitForConsent(requestId, timeout);

    // Handle the decision
    if (decision === 'accept-always') {
      await setStoredConsent(serverId, toolName, 'always');
      logger.debug(`Stored "always" consent for tool ${toolName}`);
      return true;
    }

    if (decision === 'decline') {
      // Don't store denial by default - user might want to try again
      logger.debug(`User declined tool ${toolName}`);
      return false;
    }

    // accept-once
    logger.debug(`User granted one-time consent for tool ${toolName}`);
    return true;
  } catch (error) {
    logger.error(`Consent request failed for ${toolName}:`, error);
    return false;
  }
}

/**
 * Pre-approve a tool for always execution
 */
export function preApproveToolConsent(serverId: string, toolName: string): void {
  setStoredConsent(serverId, toolName, 'always');
  logger.debug(`Pre-approved tool ${toolName} for server ${serverId}`);
}

/**
 * Deny a tool from ever executing
 */
export function denyToolConsent(serverId: string, toolName: string): void {
  setStoredConsent(serverId, toolName, 'denied');
  logger.debug(`Denied tool ${toolName} for server ${serverId}`);
}

/**
 * Reset a tool consent to ask mode
 */
export function resetToolConsent(serverId: string, toolName: string): void {
  setStoredConsent(serverId, toolName, 'ask');
  logger.debug(`Reset consent for tool ${toolName} to "ask"`);
}

// =============================================================================
// Batch Consent Operations
// =============================================================================

/**
 * Pre-approve all tools for a server
 */
export function preApproveAllServerTools(serverId: string, toolNames: string[]): void {
  for (const toolName of toolNames) {
    setStoredConsent(serverId, toolName, 'always');
  }
  logger.debug(`Pre-approved ${toolNames.length} tools for server ${serverId}`);
}

/**
 * Deny all tools for a server
 */
export function denyAllServerTools(serverId: string, toolNames: string[]): void {
  for (const toolName of toolNames) {
    setStoredConsent(serverId, toolName, 'denied');
  }
  logger.debug(`Denied ${toolNames.length} tools for server ${serverId}`);
}

/**
 * Reset all tool consents for a server to ask mode
 */
export function resetAllServerToolConsents(serverId: string, toolNames: string[]): void {
  for (const toolName of toolNames) {
    setStoredConsent(serverId, toolName, 'ask');
  }
  logger.debug(`Reset consent for ${toolNames.length} tools to "ask"`);
}
