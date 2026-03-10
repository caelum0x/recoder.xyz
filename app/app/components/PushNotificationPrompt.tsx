'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getNotificationPermission,
  initPushNotifications,
  isPushSupported,
} from '@/lib/push-notifications';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'push-prompt-dismissed-at';
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A small, dark-themed toast at the bottom-right that asks the user to enable
 * push notifications.  It only appears when:
 *
 *  1. The browser supports push.
 *  2. Notification.permission is still 'default' (not yet decided).
 *  3. The user has not dismissed the prompt within the last 30 days.
 */
export default function PushNotificationPrompt() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Determine whether to show the prompt
  useEffect(() => {
    if (!isPushSupported()) return;
    if (getNotificationPermission() !== 'default') return;

    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed) {
      const ts = parseInt(dismissed, 10);
      if (!isNaN(ts) && Date.now() - ts < COOLDOWN_MS) return;
    }

    // Small delay so the prompt does not flash immediately on load
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Dismiss (with cooldown)
  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setVisible(false);
  }, []);

  // Enable push
  const enable = useCallback(async () => {
    setLoading(true);
    const result = await initPushNotifications();
    setLoading(false);

    if (result.ok) {
      setVisible(false);
    } else {
      // If the user explicitly denied, hide the prompt and set the cooldown
      if ('reason' in result && result.reason.startsWith('permission-')) {
        dismiss();
      }
    }
  }, [dismiss]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        maxWidth: 360,
        width: '100%',
        background: 'var(--color-zinc-900, #18181b)',
        border: '1px solid var(--color-zinc-800, #27272a)',
        borderRadius: 12,
        padding: '16px 20px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: 'var(--color-zinc-200, #e4e4e7)',
        fontSize: 14,
        lineHeight: 1.5,
        animation: 'pushPromptSlideIn 0.3s ease-out',
      }}
    >
      {/* Inline keyframe for the slide-in animation */}
      <style>{`
        @keyframes pushPromptSlideIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Bell icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={20}
          height={20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-violet-400, #a78bfa)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, marginTop: 2 }}
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>

        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-zinc-50, #fafafa)' }}>
            Stay in the loop
          </p>
          <p style={{ margin: '4px 0 0', color: 'var(--color-zinc-400, #a1a1aa)', fontSize: 13 }}>
            Get notified about build completions, agent updates, and important
            alerts.
          </p>

          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 12,
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={dismiss}
              style={{
                background: 'transparent',
                border: '1px solid var(--color-zinc-700, #3f3f46)',
                borderRadius: 6,
                color: 'var(--color-zinc-400, #a1a1aa)',
                padding: '6px 14px',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  'var(--color-zinc-800, #27272a)')
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  'transparent')
              }
            >
              Not now
            </button>

            <button
              type="button"
              onClick={enable}
              disabled={loading}
              style={{
                background: 'var(--color-indigo-500, #6366f1)',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'background 0.15s, opacity 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!loading)
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'var(--color-indigo-600, #4f46e5)';
              }}
              onMouseLeave={(e) => {
                if (!loading)
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'var(--color-indigo-500, #6366f1)';
              }}
            >
              {loading ? 'Enabling...' : 'Enable'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
