/**
 * SignIn — the real "Sign in to Recoder" panel, shown when /api/conductor
 * returns 401/403 (the backend is reachable but the request is unauthenticated).
 *
 * Primary path: the RFC 8628 device-flow sign-in via the preload bridge
 * (window.__RECODER_COCKPIT__.deviceLogin). One tap opens the system browser to
 * recoder.xyz's device-authorize page, shows the user_code to enter, and polls
 * for approval. recoder.xyz is the source of truth: only a real token response
 * completes the flow. On success the main process persists the token encrypted
 * and hands it back; we store it in-memory and call onAuthenticated() so the
 * cockpit retries with the real token. No token is ever fabricated here.
 *
 * Fallback path: when the device-flow bridge is unavailable but the legacy web
 * popup login is, we drive that instead — preserving the existing behavior.
 *
 * When opened standalone in a browser (no desktop bridge at all), both buttons
 * are unavailable and we explain that sign-in requires the desktop app —
 * truthful, never a fake success.
 */
import { useEffect, useState } from 'preact/hooks';
import {
  hasDesktopDeviceLogin,
  hasDesktopLogin,
  onDeviceLoginPrompt,
  runDesktopDeviceLogin,
  runDesktopLogin,
} from '../lib/config';
import type { DeviceLoginPrompt } from '../types';

interface SignInProps {
  backendUrl: string;
  /** The unauthenticated error message from the backend, for context. */
  reason?: string;
  /** Called after a successful login so the parent can retry its fetches. */
  onAuthenticated: () => void;
}

export function SignIn({ backendUrl, reason, onAuthenticated }: SignInProps) {
  const canDeviceLogin = hasDesktopDeviceLogin();
  const canWebLogin = hasDesktopLogin();
  const canLogin = canDeviceLogin || canWebLogin;
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<DeviceLoginPrompt | null>(null);
  const [copied, setCopied] = useState(false);

  // Subscribe to the device-flow prompt (user_code + verification URI) the shell
  // emits once authorization starts. Cleared when the component unmounts.
  useEffect(() => {
    if (!canDeviceLogin) return undefined;
    const unsubscribe = onDeviceLoginPrompt((next) => {
      setPrompt(next);
      setCopied(false);
    });
    return unsubscribe;
  }, [canDeviceLogin]);

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // Clipboard may be blocked; the code is still shown for manual entry.
      setCopied(false);
    }
  }

  async function handleSignIn() {
    setSigningIn(true);
    setError(null);
    setPrompt(null);
    setCopied(false);
    try {
      // Prefer the device flow; fall back to the legacy web popup login.
      const result = canDeviceLogin
        ? await runDesktopDeviceLogin()
        : await runDesktopLogin();
      if (result.ok && result.token) {
        onAuthenticated();
        return;
      }
      setError(
        result.reason
          ? `Sign-in did not complete: ${result.reason}`
          : 'Sign-in did not complete. No session was established.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningIn(false);
      setPrompt(null);
    }
  }

  return (
    <div class="signin-overlay">
      <div class="signin-card">
        <img class="brand-mark signin-mark" src="./logo.png" alt="Recoder" width={34} height={34} />
        <h2 class="signin-title">Sign in to Recoder</h2>
        <p class="signin-sub">
          The conductor backend at <code>{backendUrl}</code> rejected the request because
          you are not signed in.
        </p>
        {reason && <p class="signin-reason">{reason}</p>}

        {canLogin ? (
          <>
            <button class="btn btn-primary signin-btn" onClick={handleSignIn} disabled={signingIn}>
              {signingIn ? 'Waiting for approval…' : 'Sign in with Recoder'}
            </button>

            {/* Device-flow prompt: show the code + URI the user must approve. */}
            {signingIn && canDeviceLogin && prompt && (
              <div class="signin-device">
                <p class="signin-hint">
                  Your browser opened to <code>{prompt.verificationUri}</code>. Enter this code
                  to approve this device:
                </p>
                <div class="signin-code-row">
                  <code class="signin-code">{prompt.userCode}</code>
                  <button
                    class="btn btn-ghost btn-sm"
                    onClick={() => copyCode(prompt.userCode)}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p class="signin-hint">
                  This panel returns automatically once you approve. The code expires in about{' '}
                  {Math.max(1, Math.round(prompt.expiresIn / 60))} min.
                </p>
              </div>
            )}

            {/* Device flow started but no prompt yet, or the legacy web popup. */}
            {signingIn && (!canDeviceLogin || !prompt) && (
              <p class="signin-hint">
                {canDeviceLogin
                  ? 'Opening your browser to approve this device…'
                  : 'Complete sign-in in the window that just opened. This panel returns automatically once your session is established.'}
              </p>
            )}
          </>
        ) : (
          <p class="signin-reason">
            Sign-in is only available inside the Recoder desktop app. Open the cockpit
            from the desktop app to authenticate with your recoder.xyz session.
          </p>
        )}

        {error && <p class="signin-error">{error}</p>}
      </div>
    </div>
  );
}
