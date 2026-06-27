/**
 * SignIn — the real "Sign in to Recoder" panel, shown when /api/conductor
 * returns 401/403 (the backend is reachable but the request is unauthenticated).
 *
 * The button drives the desktop app's EXISTING recoder.xyz auth flow via the
 * preload bridge (window.__RECODER_COCKPIT__.login / recoderDesktop.login). On
 * success the main process hands back a real session token (env / web-session
 * cookie / API key); we store it in-memory and call onAuthenticated() so the
 * cockpit retries with the real token. No token is ever fabricated here.
 *
 * When opened standalone in a browser (no desktop bridge), the login button is
 * disabled and we explain that sign-in requires the desktop app — truthful,
 * never a fake success.
 */
import { useState } from 'preact/hooks';
import { hasDesktopLogin, runDesktopLogin } from '../lib/config';

interface SignInProps {
  backendUrl: string;
  /** The unauthenticated error message from the backend, for context. */
  reason?: string;
  /** Called after a successful login so the parent can retry its fetches. */
  onAuthenticated: () => void;
}

export function SignIn({ backendUrl, reason, onAuthenticated }: SignInProps) {
  const canLogin = hasDesktopLogin();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setSigningIn(true);
    setError(null);
    try {
      const result = await runDesktopLogin();
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
    }
  }

  return (
    <div class="signin-overlay">
      <div class="signin-card">
        <span class="brand-mark signin-mark" />
        <h2 class="signin-title">Sign in to Recoder</h2>
        <p class="signin-sub">
          The conductor backend at <code>{backendUrl}</code> rejected the request because
          you are not signed in.
        </p>
        {reason && <p class="signin-reason">{reason}</p>}

        {canLogin ? (
          <>
            <button class="btn btn-primary signin-btn" onClick={handleSignIn} disabled={signingIn}>
              {signingIn ? 'Waiting for sign-in…' : 'Sign in with Recoder'}
            </button>
            {signingIn && (
              <p class="signin-hint">
                Complete sign-in in the window that just opened. This panel returns
                automatically once your session is established.
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
