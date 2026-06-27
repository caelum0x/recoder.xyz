/**
 * Cockpit config contract.
 *
 * The Electron shell injects `window.__RECODER_COCKPIT__ = { backendUrl, token,
 * login, resolveToken }` before loading the renderer. This is the single seam
 * between shell and renderer: the shell knows DOCKER_BACKEND_URL (default
 * http://localhost:3100) and the auth token (RECODER_SESSION_TOKEN /
 * web-session cookie / RECODER_API_KEY); the renderer only reads it here.
 *
 * If the shell injected nothing (e.g. opened standalone in a browser for dev), we
 * fall back to localhost:3100 with no token — and the UI will truthfully surface
 * whatever the backend returns (including auth failures).
 *
 * Auth note: the injected `token` is fixed at window-creation time. After the
 * user signs in via the desktop's real recoder.xyz auth flow, the main process
 * hands back a fresh token in two ways:
 *   1. `window.__RECODER_COCKPIT_RUNTIME__ = { token }` (set via executeJavaScript
 *      on the reloaded cockpit page), and
 *   2. the `login()` IPC return value, which the renderer stores via setRuntimeToken().
 * Both feed `readConfig().token` so subsequent /api/conductor calls use the real
 * session — without inventing a new auth scheme or faking a token.
 */
import type { CockpitAuthResult, CockpitConfig } from '../types';

declare global {
  interface Window {
    __RECODER_COCKPIT__?: CockpitConfig;
    /** Runtime token override injected by the main process after a fresh login. */
    __RECODER_COCKPIT_RUNTIME__?: { backendUrl?: string; token?: string; tokenSource?: string };
  }
}

const DEFAULT_BACKEND_URL = 'http://localhost:3100';

/** Token set at runtime by a successful login() (kept in-memory for this session). */
let runtimeToken: string | undefined;

/** Read the highest-priority token: runtime login > main-process runtime > preload config. */
function resolveToken(): string | undefined {
  if (runtimeToken) return runtimeToken;
  const injectedRuntime =
    typeof window !== 'undefined' ? window.__RECODER_COCKPIT_RUNTIME__ : undefined;
  if (injectedRuntime?.token) return injectedRuntime.token;
  const injected = typeof window !== 'undefined' ? window.__RECODER_COCKPIT__ : undefined;
  return injected?.token;
}

export function readConfig(): CockpitConfig {
  const injected = typeof window !== 'undefined' ? window.__RECODER_COCKPIT__ : undefined;
  const backendUrl = (injected?.backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
  return {
    backendUrl,
    token: resolveToken(),
    defaults: injected?.defaults,
    login: injected?.login,
    resolveToken: injected?.resolveToken,
  };
}

/** True only when the shell actually injected a config object (not the fallback). */
export function configWasInjected(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__RECODER_COCKPIT__);
}

/** True when the desktop shell exposes the real recoder.xyz login bridge. */
export function hasDesktopLogin(): boolean {
  return typeof readConfig().login === 'function';
}

/**
 * Drive the desktop app's REAL recoder.xyz auth flow. Resolves to the auth
 * result; on success the fresh token is stored in-memory so readConfig().token
 * returns it for subsequent /api/conductor calls. Returns a not-ok result when
 * the login bridge is unavailable (e.g. standalone browser) — never fakes a token.
 */
export async function runDesktopLogin(): Promise<CockpitAuthResult> {
  const { login } = readConfig();
  if (typeof login !== 'function') {
    return { ok: false, reason: 'no-desktop-login' };
  }
  const result = await login();
  if (result.ok && result.token) {
    runtimeToken = result.token;
  }
  return result;
}

/** Test/escape hatch: set the in-memory runtime token directly. */
export function setRuntimeToken(token: string | undefined): void {
  runtimeToken = token && token.trim() ? token.trim() : undefined;
}
