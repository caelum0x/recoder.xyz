/**
 * PermissionCoach — a calm, dismissible macOS coach card (conductor-style):
 * "Tired of permission popups? Grant full disk access so agents work without
 * repeated folder prompts." Shown only on macOS inside the desktop shell, and
 * only until dismissed (persisted in localStorage). Clicking the button opens the
 * Full Disk Access pane in System Settings via the Electron bridge.
 */
import { useState } from 'preact/hooks';
import { desktopPlatform, openSystemSettings } from '../lib/desktop';

const DISMISS_KEY = 'recoder.permissionCoach.dismissed';

function alreadyDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function PermissionCoach() {
  const [dismissed, setDismissed] = useState(alreadyDismissed());

  // macOS desktop only — nothing to coach on Windows/Linux or in the browser.
  if (dismissed || desktopPlatform() !== 'darwin') return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Non-fatal: still dismiss for this session.
    }
    setDismissed(true);
  }

  return (
    <div class="permission-coach">
      <button class="permission-coach-close" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
      <div class="permission-coach-title">Tired of macOS permission popups?</div>
      <p class="permission-coach-body">
        Grant Recoder full disk access so your agents can work without repeated folder-permission
        prompts.
      </p>
      <button class="permission-coach-action" onClick={() => void openSystemSettings('fullDiskAccess')}>
        Open System Settings →
      </button>
    </div>
  );
}
