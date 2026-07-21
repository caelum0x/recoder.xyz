/**
 * backend-phase-line — pure mapper from the redacted embedded-backend phase to a
 * single, honest banner line. No hooks, no DOM: App.tsx renders the string.
 *
 * Vocabulary is deliberately 'backend' only (never supervisor/tmux/openfang) —
 * the engines stay invisible. Returns null for any phase that is NOT a
 * transient/failure state the operator should see (idle/ready/stopped/unknown)
 * or a null status, so the caller renders the EXACT original generic banner.
 */
import type { BackendPhaseSnapshot } from '../types';

export function backendPhaseLine(status: BackendPhaseSnapshot | null): string | null {
  if (status == null) return null;
  switch (status.phase) {
    case 'starting':
      return 'Starting the backend…';
    case 'crashed':
      return `Backend restarting (crashed ${status.restartCount} time(s))…`;
    case 'failed': {
      const msg = status.userMessage?.trim() || 'the backend could not start';
      const log = status.logPath ? ` Log: ${status.logPath}` : '';
      return `Backend could not start — ${msg}.${log}`;
    }
    default:
      return null;
  }
}
