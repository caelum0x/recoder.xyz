/**
 * Auto Error Fix Hook
 *
 * Automatically detects build/runtime errors and triggers AI fixes.
 * This enables a seamless development experience where users see live preview
 * without manual intervention for fixable errors.
 *
 * Features:
 * - Multi-pass compile -> fix -> verify -> retry loop
 * - Listens for compile-errors-detected events from action-runner
 * - Verify-after-fix cycle: detects when streaming stops, waits for dev server
 *   reload, re-polls for errors, and decides whether to retry or finish
 * - Smarter attempt tracking with consecutiveSameErrorFails counter
 * - Debounced error detection to avoid spamming
 * - Only triggers for blocking errors (syntax, type, module errors)
 * - Can be disabled via settings
 * - Exponential backoff for repeated same-error failures
 */

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { map } from 'nanostores';
import { workbenchStore } from '~/lib/stores/workbench';
import { dockerGet } from '~/lib/services/docker-api';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('AutoErrorFix');

/**
 * Get the Better Auth session token from cookies
 */
function getSessionToken(): string | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';');
  const cookieNames = [
    '__Secure-recoder.session_token',
    'recoder.session_token',
    '__Secure-session_token',
    'session_token',
    'recoder_session_token',
  ];

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split('=');
    const value = valueParts.join('=');
    if (cookieNames.includes(name) && value) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

// ============================================
// Types
// ============================================

export interface BuildError {
  id: string;
  type: 'syntax' | 'type' | 'reference' | 'module' | 'build' | 'npm' | 'runtime' | 'unknown';
  severity: 'error' | 'warning';
  message: string;
  shortMessage: string;
  filePath?: string;
  line?: number;
  column?: number;
  source: 'typescript' | 'vite' | 'eslint' | 'npm' | 'runtime' | 'unknown';
  rawError: string;
  timestamp: number;
}

export interface AutoFixState {
  enabled: boolean;
  isFixing: boolean;
  lastFixAttempt: number;
  fixCount: number;
  maxFixesPerSession: number;
  currentErrors: BuildError[];
  lastFixedErrors: string[];
  cooldownUntil: number;
  consecutiveSameErrorFails: number;
}

// ============================================
// Store
// ============================================

const initialState: AutoFixState = {
  enabled: true,
  isFixing: false,
  lastFixAttempt: 0,
  fixCount: 0,
  maxFixesPerSession: 10,
  currentErrors: [],
  lastFixedErrors: [],
  cooldownUntil: 0,
  consecutiveSameErrorFails: 0,
};

export const autoFixStore = map<AutoFixState>(initialState);

// ============================================
// Store Actions
// ============================================

export function setAutoFixEnabled(enabled: boolean): void {
  autoFixStore.setKey('enabled', enabled);
}

export function setCurrentErrors(errors: BuildError[]): void {
  autoFixStore.setKey('currentErrors', errors);
}

export function startFixing(): void {
  const state = autoFixStore.get();
  autoFixStore.setKey('isFixing', true);
  autoFixStore.setKey('lastFixAttempt', Date.now());
  autoFixStore.setKey('fixCount', state.fixCount + 1);
}

export function finishFixing(success: boolean, errorHashes: string[] = []): void {
  autoFixStore.setKey('isFixing', false);

  if (success) {
    autoFixStore.setKey('lastFixedErrors', errorHashes);
    // Reset consecutive fail counter on success
    autoFixStore.setKey('consecutiveSameErrorFails', 0);
  }
}

export function incrementSameErrorFails(): void {
  const state = autoFixStore.get();
  autoFixStore.setKey('consecutiveSameErrorFails', state.consecutiveSameErrorFails + 1);
}

export function resetSameErrorFails(): void {
  autoFixStore.setKey('consecutiveSameErrorFails', 0);
}

export function enterCooldown(durationMs: number): void {
  autoFixStore.setKey('cooldownUntil', Date.now() + durationMs);

  setTimeout(() => {
    const state = autoFixStore.get();
    if (Date.now() >= state.cooldownUntil) {
      autoFixStore.setKey('cooldownUntil', 0);
    }
  }, durationMs);
}

export function resetAutoFix(): void {
  autoFixStore.set({
    ...initialState,
    enabled: autoFixStore.get().enabled,
  });
}

// ============================================
// Helper Functions
// ============================================

function hashError(error: BuildError): string {
  return `${error.type}:${error.filePath || ''}:${error.line || ''}:${error.shortMessage}`;
}

function hashErrorSet(errors: BuildError[]): string {
  return errors.map(hashError).sort().join('|');
}

function areErrorsSameAsLastFix(errors: BuildError[]): boolean {
  const state = autoFixStore.get();
  if (state.lastFixedErrors.length === 0) return false;

  const lastHashes = new Set(state.lastFixedErrors);

  if (errors.length > 0 && errors.every(e => lastHashes.has(hashError(e)))) {
    return true;
  }

  return false;
}

function isAutoFixable(error: BuildError): boolean {
  if (error.severity !== 'error') return false;
  const fixableTypes = ['syntax', 'type', 'reference', 'module', 'build', 'runtime'];
  return fixableTypes.includes(error.type);
}

function formatErrorsForAI(errors: BuildError[]): string {
  if (errors.length === 0) return '';

  // Filter out obviously broken/partial lines to avoid useless prompts (e.g. "F")
  const filteredErrors = errors.filter((error) => {
    const message = (error.message || '').trim();
    return message.length >= 5;
  });

  if (filteredErrors.length === 0) return '';

  const errorDetails = filteredErrors.map((error, index) => {
    let detail = `Error ${index + 1}: ${error.message}`;

    if (error.filePath) {
      detail += `\nFile: ${error.filePath}`;
      if (error.line) {
        detail += `:${error.line}`;
        if (error.column) detail += `:${error.column}`;
      }
    }

    if (error.rawError && error.rawError !== error.message) {
      detail += `\n\nRaw error:\n${error.rawError}`;
    }

    return detail;
  }).join('\n\n---\n\n');

  return `[AUTO-FIX] Fix these build/runtime errors blocking the preview:\n\n${errorDetails}\n\nPlease fix all errors above. The app won't run until these are resolved.`;
}

function getBackoffDelay(attemptCount: number): number {
  const baseDelay = 5000;
  const maxDelay = 60000;
  return Math.min(baseDelay * Math.pow(2, attemptCount - 1), maxDelay);
}

// ============================================
// Parse Raw Errors (from compile-errors-detected event)
// ============================================

/**
 * Converts raw error strings from the compile-errors-detected event
 * (dispatched by action-runner's #postGenerationCompileCheck) into
 * structured BuildError objects.
 */
function parseRawErrors(rawErrors: string[]): BuildError[] {
  return rawErrors.map((raw, index) => {
    // Try to parse file path and line number
    const fileMatch = raw.match(/(?:in |from ["']|File: )([\w/.@-]+\.(?:tsx?|jsx?|css|scss|html))/i);
    const lineMatch = raw.match(/:(\d+)(?::(\d+))?/);

    // Determine error type and source
    let type: BuildError['type'] = 'unknown';
    let source: BuildError['source'] = 'unknown';
    if (/error TS\d+/.test(raw)) { type = 'type'; source = 'typescript'; }
    else if (/Failed to resolve|Module not found|Cannot find module/.test(raw)) { type = 'module'; source = 'vite'; }
    else if (/SyntaxError|Unexpected token/.test(raw)) { type = 'syntax'; source = 'vite'; }
    else if (/is not defined|ReferenceError/.test(raw)) { type = 'reference'; source = 'runtime'; }
    else if (/ERROR/.test(raw)) { type = 'build'; source = 'vite'; }

    return {
      id: `compile-${Date.now()}-${index}`,
      type,
      severity: 'error' as const,
      message: raw,
      shortMessage: raw.substring(0, 100),
      filePath: fileMatch?.[1],
      line: lineMatch ? parseInt(lineMatch[1]) : undefined,
      column: lineMatch?.[2] ? parseInt(lineMatch[2]) : undefined,
      source,
      rawError: raw,
      timestamp: Date.now(),
    };
  });
}

// ============================================
// Hook
// ============================================

interface UseAutoErrorFixOptions {
  enabled?: boolean;
  debounceMs?: number;
  maxAttempts?: number;
  onErrorDetected?: (errors: BuildError[]) => void;
  onFixTriggered?: (errors: BuildError[]) => void;
  onFixComplete?: (success: boolean) => void;
  isStreaming?: boolean;
}

export function useAutoErrorFix(options: UseAutoErrorFixOptions = {}) {
  const {
    enabled = true,
    debounceMs = 3000,
    maxAttempts = 10,
    onErrorDetected,
    onFixTriggered,
    onFixComplete,
    isStreaming = false,
  } = options;

  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);
  const autoFixState = useStore(autoFixStore);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastErrorHashRef = useRef<string>('');
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connectedProjectRef = useRef<string | null>(null);
  const prevIsStreamingRef = useRef<boolean>(isStreaming);
  const verifyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingErrorHashRef = useRef<string>('');

  // WebSocket reconnection state
  const wsReconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wsConsecutiveFailsRef = useRef<number>(0);
  const wsBackoffDelayRef = useRef<number>(2000); // starts at 2s
  const wsOpenTimestampRef = useRef<number>(0);
  const wsRetriesExhaustedRef = useRef<boolean>(false);
  // Track whether the cleanup function intentionally closed the WS
  const wsIntentionalCloseRef = useRef<boolean>(false);

  // ---- triggerFix ----
  // Dispatches the recoder:fix-errors event so Chat.client.tsx sends the
  // error prompt to the AI.  Does NOT set a blind 5-second timeout;
  // completion is detected by the streaming-complete transition in the
  // verify-after-fix useEffect below.
  const triggerFix = useCallback((errors: BuildError[]) => {
    const state = autoFixStore.get();

    if (!state.enabled || !enabled) {
      logger.info('[AutoFix] Disabled, skipping fix');
      return;
    }

    if (state.isFixing) {
      logger.info('[AutoFix] Already fixing, skipping');
      return;
    }

    if (isStreaming) {
      logger.info('[AutoFix] AI is streaming, skipping');
      return;
    }

    if (Date.now() < state.cooldownUntil) {
      logger.info('[AutoFix] In cooldown, skipping');
      return;
    }

    if (state.fixCount >= maxAttempts) {
      logger.info('[AutoFix] Max attempts reached, entering cooldown');
      enterCooldown(60000);
      return;
    }

    // Smarter same-error check: give up after 3 consecutive same-error fails
    if (state.consecutiveSameErrorFails >= 3) {
      logger.info('[AutoFix] 3 consecutive same-error failures, entering extended cooldown');
      enterCooldown(120000);
      return;
    }

    if (areErrorsSameAsLastFix(errors) && state.consecutiveSameErrorFails > 0) {
      logger.info('[AutoFix] Same errors as last fix attempt, entering backoff');
      enterCooldown(getBackoffDelay(state.consecutiveSameErrorFails));
      return;
    }

    const fixableErrors = errors.filter(isAutoFixable);
    if (fixableErrors.length === 0) {
      logger.info('[AutoFix] No fixable errors found');
      return;
    }

    logger.info(`[AutoFix] Triggering fix for ${fixableErrors.length} errors (attempt ${state.fixCount + 1}/${maxAttempts})`);

    // Check if errors produce a usable prompt BEFORE incrementing the fix counter.
    // 502/network errors during dev server restart generate empty prompts — we don't
    // want to waste fix attempts on those.
    const prompt = formatErrorsForAI(fixableErrors);
    if (!prompt) {
      logger.info('[AutoFix] Skipping fix — empty/invalid error prompt (not counting as attempt)');
      return;
    }

    // Record the hash of errors we are about to fix so verify-after-fix
    // can compare later.
    pendingErrorHashRef.current = hashErrorSet(fixableErrors);

    startFixing();
    onFixTriggered?.(fixableErrors);

    window.dispatchEvent(new CustomEvent('recoder:fix-errors', {
      detail: {
        prompt,
        auto: true,
        errors: fixableErrors,
      }
    }));

    // NOTE: No blind setTimeout here.  The verify-after-fix useEffect
    // (watching isStreaming transition false) handles completion.

  }, [enabled, isStreaming, maxAttempts, onFixTriggered]);

  // ---- handleErrors ----
  const handleErrors = useCallback((errors: BuildError[]) => {
    setCurrentErrors(errors);
    onErrorDetected?.(errors);

    const errorHash = errors.map(hashError).sort().join('|');

    if (errorHash === lastErrorHashRef.current) {
      return;
    }
    lastErrorHashRef.current = errorHash;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      if (errors.length > 0) {
        triggerFix(errors);
      } else {
        lastErrorHashRef.current = '';
      }
    }, debounceMs);

  }, [debounceMs, onErrorDetected, triggerFix]);

  // ---- pollForErrors ----
  const pollForErrors = useCallback(async (): Promise<BuildError[]> => {
    if (!projectId || !containerReady) return [];

    try {
      const data = await dockerGet<{
        logs: string;
        errors: BuildError[];
        hasBlockingErrors: boolean;
        timestamp: number;
      }>(`/api/logs/${projectId}/parsed`);

      if (data.hasBlockingErrors && data.errors && data.errors.length > 0) {
        handleErrors(data.errors);
        return data.errors;
      } else if (autoFixStore.get().currentErrors.length > 0) {
        setCurrentErrors([]);
        lastErrorHashRef.current = '';
      }
      return [];
    } catch (error) {
      logger.debug('[AutoFix] Poll failed:', error);
      return [];
    }
  }, [projectId, containerReady, handleErrors]);

  // ---- Stable refs for callbacks ----
  // These let connectWebSocket and the polling interval read the latest
  // values without being re-created (and re-triggering the main effect)
  // every render.
  const handleErrorsRef = useRef(handleErrors);
  const enabledRef = useRef(enabled);
  const pollForErrorsRef = useRef(pollForErrors);
  useEffect(() => { handleErrorsRef.current = handleErrors; }, [handleErrors]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { pollForErrorsRef.current = pollForErrors; }, [pollForErrors]);

  // ---- WebSocket reconnect helpers ----
  const WS_BACKOFF_INITIAL = 2000;   // 2 seconds
  const WS_BACKOFF_MAX = 30000;      // 30 seconds
  const WS_MAX_CONSECUTIVE_FAILS = 5;
  const WS_STABLE_THRESHOLD = 5000;  // connection must stay open 5s to be "stable"

  const resetWsBackoff = useCallback(() => {
    wsConsecutiveFailsRef.current = 0;
    wsBackoffDelayRef.current = WS_BACKOFF_INITIAL;
    wsRetriesExhaustedRef.current = false;
  }, []);

  // ---- connectWebSocket ----
  // Only depends on projectId and containerReady so the main effect
  // does not re-run when handleErrors/enabled change.
  const connectWebSocket = useCallback(() => {
    if (!projectId || !containerReady) return;

    // Already connected to this project
    if (connectedProjectRef.current === projectId && wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Retries exhausted -- do not reconnect
    if (wsRetriesExhaustedRef.current) {
      return;
    }

    // Cancel any pending reconnect timer
    if (wsReconnectTimerRef.current) {
      clearTimeout(wsReconnectTimerRef.current);
      wsReconnectTimerRef.current = null;
    }

    if (wsRef.current) {
      wsIntentionalCloseRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const dockerHost = import.meta.env.VITE_DOCKER_BACKEND_URL || '';
    let wsUrl: string;

    if (dockerHost) {
      const host = dockerHost.replace(/^https?:\/\//, '');
      wsUrl = `${protocol}//${host}/build-errors/${projectId}`;
    } else {
      wsUrl = `ws://localhost:3100/build-errors/${projectId}`;
    }

    try {
      const token = getSessionToken();
      const authUrl = token ? `${wsUrl}?token=${encodeURIComponent(token)}` : wsUrl;

      const ws = new WebSocket(authUrl);
      wsRef.current = ws;
      connectedProjectRef.current = projectId;
      wsIntentionalCloseRef.current = false;

      ws.onopen = () => {
        logger.info(`[AutoFix] WebSocket connected for ${projectId}`);
        wsOpenTimestampRef.current = Date.now();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'errors' && data.errors) {
            handleErrorsRef.current(data.errors);
          } else if (data.type === 'clear') {
            setCurrentErrors([]);
            lastErrorHashRef.current = '';
          }
        } catch (e) {
          logger.warn('[AutoFix] Failed to parse WebSocket message:', e);
        }
      };

      ws.onerror = (error) => {
        logger.warn('[AutoFix] WebSocket error:', error);
      };

      ws.onclose = () => {
        wsRef.current = null;
        connectedProjectRef.current = null;

        // If the cleanup function or a new connectWebSocket call closed
        // this socket intentionally, do not attempt to reconnect.
        if (wsIntentionalCloseRef.current) {
          wsIntentionalCloseRef.current = false;
          return;
        }

        // Determine if this was an "immediate close" (connected < 5s)
        const connectionDuration = Date.now() - wsOpenTimestampRef.current;
        const wasStable = connectionDuration >= WS_STABLE_THRESHOLD;

        if (wasStable) {
          // Connection was healthy before closing -- reset backoff
          logger.info('[AutoFix] WebSocket closed after stable connection, resetting backoff');
          resetWsBackoff();
        } else {
          // Rapid connect/disconnect -- count as a failure
          wsConsecutiveFailsRef.current += 1;
          wsBackoffDelayRef.current = Math.min(
            WS_BACKOFF_INITIAL * Math.pow(2, wsConsecutiveFailsRef.current - 1),
            WS_BACKOFF_MAX,
          );
          logger.info(
            `[AutoFix] WebSocket closed after ${connectionDuration}ms ` +
            `(consecutive fails: ${wsConsecutiveFailsRef.current}/${WS_MAX_CONSECUTIVE_FAILS}, ` +
            `next backoff: ${wsBackoffDelayRef.current}ms)`,
          );
        }

        // If too many consecutive rapid failures, give up
        if (wsConsecutiveFailsRef.current >= WS_MAX_CONSECUTIVE_FAILS) {
          logger.warn(
            `[AutoFix] WebSocket reconnection stopped after ${WS_MAX_CONSECUTIVE_FAILS} ` +
            'consecutive failed connections. The build-errors endpoint may be unavailable. ' +
            'Falling back to polling only.',
          );
          wsRetriesExhaustedRef.current = true;
          return;
        }

        // Schedule reconnect with backoff if still enabled
        if (enabledRef.current && autoFixStore.get().enabled) {
          const delay = wasStable ? WS_BACKOFF_INITIAL : wsBackoffDelayRef.current;
          wsReconnectTimerRef.current = setTimeout(() => {
            wsReconnectTimerRef.current = null;
            if (enabledRef.current && autoFixStore.get().enabled) {
              connectWebSocket();
            }
          }, delay);
        }
      };
    } catch (error) {
      logger.warn('[AutoFix] Failed to create WebSocket:', error);
    }
  }, [projectId, containerReady, resetWsBackoff]);

  // ---- Main setup effect ----
  // Dependencies are kept minimal and stable to avoid the effect re-running
  // on every render (which would close/reopen the WebSocket). Callbacks that
  // change frequently (handleErrors, pollForErrors) are accessed via refs.
  useEffect(() => {
    if (!enabled || !projectId || !containerReady) {
      return;
    }

    setAutoFixEnabled(enabled);

    // Reset WebSocket backoff state when the effect re-runs (e.g. new project)
    resetWsBackoff();
    connectWebSocket();

    // Use the ref for polling so this interval always calls the latest version
    pollingIntervalRef.current = setInterval(() => { pollForErrorsRef.current(); }, 10000);
    pollForErrorsRef.current();

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (verifyTimerRef.current) {
        clearTimeout(verifyTimerRef.current);
      }
      if (wsReconnectTimerRef.current) {
        clearTimeout(wsReconnectTimerRef.current);
        wsReconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsIntentionalCloseRef.current = true;
        wsRef.current.close();
        wsRef.current = null;
      }
      connectedProjectRef.current = null;
    };
    // connectWebSocket depends on [projectId, containerReady, resetWsBackoff]
    // resetWsBackoff has [] deps (stable). So this effect only re-runs when
    // enabled, projectId, or containerReady actually change.
  }, [enabled, projectId, containerReady, connectWebSocket, resetWsBackoff]);

  // ---- Sync enabled state ----
  useEffect(() => {
    setAutoFixEnabled(enabled);
  }, [enabled]);

  // ---- Reset on project change ----
  useEffect(() => {
    resetAutoFix();
    lastErrorHashRef.current = '';
    pendingErrorHashRef.current = '';
    resetWsBackoff();
  }, [projectId, resetWsBackoff]);

  // ============================================
  // NEW: Listen for compile-errors-detected events
  // ============================================
  // action-runner.ts dispatches this event from #postGenerationCompileCheck()
  // with { errors: string[], projectId: string }.
  useEffect(() => {
    if (!enabled) return;

    const handleCompileErrors = (event: Event) => {
      const customEvent = event as CustomEvent<{ errors: string[]; projectId: string }>;
      const { errors: rawErrors, projectId: eventProjectId } = customEvent.detail;

      // Only handle errors for the current project
      if (eventProjectId && projectId && eventProjectId !== projectId) {
        return;
      }

      if (!rawErrors || rawErrors.length === 0) {
        return;
      }

      logger.info(`[AutoFix] Received compile-errors-detected: ${rawErrors.length} errors`);

      // Parse raw error strings into BuildError objects
      const parsedErrors = parseRawErrors(rawErrors);
      handleErrors(parsedErrors);
    };

    window.addEventListener('compile-errors-detected', handleCompileErrors);

    return () => {
      window.removeEventListener('compile-errors-detected', handleCompileErrors);
    };
  }, [enabled, projectId, handleErrors]);

  // ============================================
  // NEW: Verify-after-fix cycle
  // ============================================
  // Detects when isStreaming transitions from true -> false while isFixing
  // is true.  Waits 7 seconds for the dev server to reload, then re-polls
  // for errors.  Decides whether to finish (success), retry (new errors),
  // or increment consecutiveSameErrorFails (same errors).
  useEffect(() => {
    const wasStreaming = prevIsStreamingRef.current;
    prevIsStreamingRef.current = isStreaming;

    // Detect streaming complete: was streaming, now not streaming
    if (wasStreaming && !isStreaming) {
      const state = autoFixStore.get();

      if (!state.isFixing) {
        // Not in a fix cycle, nothing to verify
        return;
      }

      logger.info('[AutoFix] Streaming completed during fix cycle, waiting 7s for dev server reload...');

      // Clear any previous verify timer
      if (verifyTimerRef.current) {
        clearTimeout(verifyTimerRef.current);
      }

      // Wait 7 seconds for dev server to reload and compile
      verifyTimerRef.current = setTimeout(async () => {
        logger.info('[AutoFix] Verifying fix result...');

        const remainingErrors = await pollForErrors();
        const previousHash = pendingErrorHashRef.current;

        if (remainingErrors.length === 0) {
          // All errors gone -- success!
          logger.info('[AutoFix] Fix verified -- no errors remain');
          const errorHashes = autoFixStore.get().currentErrors.map(hashError);
          finishFixing(true, errorHashes);
          onFixComplete?.(true);
          pendingErrorHashRef.current = '';
        } else {
          const newHash = hashErrorSet(remainingErrors);

          if (newHash === previousHash) {
            // Same errors persist -- increment consecutive fail counter
            incrementSameErrorFails();
            const currentState = autoFixStore.get();
            logger.info(`[AutoFix] Same errors persist after fix (consecutive fails: ${currentState.consecutiveSameErrorFails})`);

            // Record these error hashes so areErrorsSameAsLastFix works
            const errorHashes = remainingErrors.map(hashError);
            finishFixing(false, errorHashes);
            onFixComplete?.(false);

            if (currentState.consecutiveSameErrorFails >= 3) {
              logger.info('[AutoFix] 3 consecutive same-error failures, giving up on this pattern');
              enterCooldown(120000);
            } else {
              // Backoff before retrying
              const backoffMs = getBackoffDelay(currentState.consecutiveSameErrorFails);
              logger.info(`[AutoFix] Entering backoff for ${backoffMs}ms before next attempt`);
              enterCooldown(backoffMs);
            }
          } else {
            // Different errors -- the fix changed something but introduced new issues
            // Reset the consecutive same-error counter since errors are different
            resetSameErrorFails();
            logger.info(`[AutoFix] Fix changed the errors (${remainingErrors.length} new/different errors), triggering another fix round`);

            finishFixing(false);
            pendingErrorHashRef.current = '';

            // Trigger another fix round for the new errors after a short delay
            setTimeout(() => {
              const fixableErrors = remainingErrors.filter(isAutoFixable);
              if (fixableErrors.length > 0) {
                triggerFix(fixableErrors);
              }
            }, 2000);
          }
        }

        // Notify action-runner to re-run compile check (closes the loop)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('recoder:recheck-compile'));
        }
      }, 7000);
    }
  }, [isStreaming, pollForErrors, onFixComplete, triggerFix]);

  return {
    ...autoFixState,
    setEnabled: setAutoFixEnabled,
    reset: resetAutoFix,
    triggerManualFix: () => {
      const errors = autoFixState.currentErrors;
      if (errors.length > 0) {
        triggerFix(errors);
      }
    },
  };
}

export default useAutoErrorFix;
