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
import type { CockpitAuthResult, CockpitConfig, CockpitIdentity } from '../types';

declare global {
  interface Window {
    /**
     * Injected by a shell. Partial because the shape differs by host: the
     * Electron cockpit window injects the full CockpitConfig, while the wave
     * <webview> preload exposes only { backendUrl, token } (plus the
     * openWorkspaceTerminal action typed structurally in lib/wave-bridge.ts)
     * — and just the action when the backend is not READY yet.
     */
    __RECODER_COCKPIT__?: Partial<CockpitConfig>;
    /**
     * Runtime overrides injected by the main process. `token`/`backendUrl` are
     * set after a fresh login; `identity` is the freshly-captured display
     * identity (if any); `view` is an optional initial-view deep link set by a
     * menu/launcher action.
     */
    __RECODER_COCKPIT_RUNTIME__?: {
      backendUrl?: string;
      token?: string;
      tokenSource?: string;
      identity?: CockpitIdentity;
      view?: string;
    };
  }
}

/**
 * The discoverable cockpit surfaces a deep link / launcher can target.
 *
 * The cockpit is a TERMINAL, not an infra dashboard: the only human-facing
 * surface is the workspace `board` (parallel agent runs). The engine dashboards
 * (governance, policy, memory, substrates, events, connectors, brain, …) were
 * removed from the nav — the engines run INVISIBLY behind the run flow, not as
 * deep-linkable views. Approvals surface INLINE in the workspace detail.
 * RETIRED (wave-desktop fusion §5): 'sessions' and 'dmux' terminal-era surfaces.
 */
export type CockpitView = 'board';

const COCKPIT_VIEWS: readonly CockpitView[] = ['board'];

/** Custom DOM event the shell dispatches to navigate the live cockpit. */
export const COCKPIT_NAVIGATE_EVENT = 'recoder-cockpit:navigate';

function isCockpitView(value: unknown): value is CockpitView {
  return typeof value === 'string' && (COCKPIT_VIEWS as readonly string[]).includes(value);
}

/**
 * The initial view the cockpit should open on, from a launcher/menu deep link
 * (`window.__RECODER_COCKPIT_RUNTIME__.view`). Returns null when no valid hint
 * was injected, so the App falls back to its default ('board').
 */
export function readInitialView(): CockpitView | null {
  const runtime = typeof window !== 'undefined' ? window.__RECODER_COCKPIT_RUNTIME__ : undefined;
  return isCockpitView(runtime?.view) ? runtime.view : null;
}

const DEFAULT_BACKEND_URL = 'http://localhost:3100';

/**
 * Fallback backendUrl when the shell injected nothing. When the cockpit is
 * SERVED BY the backend itself (http(s)://…/cockpit/… — the wave-webview
 * path), the page origin IS the backend, so same-origin is the truthful
 * default and works on any port. Everywhere else (Electron file:// load,
 * standalone dev) keep the historical localhost:3100 default.
 */
function defaultBackendUrl(): string {
  if (typeof window === 'undefined' || !window.location) return DEFAULT_BACKEND_URL;
  const { protocol, pathname, origin } = window.location;
  const isHttp = protocol === 'http:' || protocol === 'https:';
  if (isHttp && typeof pathname === 'string' && pathname.startsWith('/cockpit')) return origin;
  return DEFAULT_BACKEND_URL;
}

/** Token set at runtime by a successful login() (kept in-memory for this session). */
let runtimeToken: string | undefined;

/**
 * Identity set at runtime by a successful login()/refresh (in-memory for this
 * session). `null` means "explicitly cleared" (signed out / no identity), which
 * suppresses the preload-injected identity so a stale email never lingers after
 * sign-out. `undefined` means "not yet set" → fall through to injected config.
 */
let runtimeIdentity: CockpitIdentity | null | undefined;

/** Read the highest-priority token: runtime login > main-process runtime > preload config. */
function resolveToken(): string | undefined {
  if (runtimeToken) return runtimeToken;
  const injectedRuntime =
    typeof window !== 'undefined' ? window.__RECODER_COCKPIT_RUNTIME__ : undefined;
  if (injectedRuntime?.token) return injectedRuntime.token;
  const injected = typeof window !== 'undefined' ? window.__RECODER_COCKPIT__ : undefined;
  return injected?.token;
}

/**
 * Read the highest-priority identity: in-memory runtime (login/refresh) >
 * main-process runtime injection > preload config. Returns undefined when no
 * identity is known (the header then shows a generic "Signed in"). A runtime
 * value of `null` (sign-out) deliberately reports undefined.
 */
function resolveIdentity(): CockpitIdentity | undefined {
  if (runtimeIdentity !== undefined) return runtimeIdentity || undefined;
  const injectedRuntime =
    typeof window !== 'undefined' ? window.__RECODER_COCKPIT_RUNTIME__ : undefined;
  if (injectedRuntime?.identity) return injectedRuntime.identity;
  const injected = typeof window !== 'undefined' ? window.__RECODER_COCKPIT__ : undefined;
  return injected?.identity;
}

export function readConfig(): CockpitConfig {
  const injected = typeof window !== 'undefined' ? window.__RECODER_COCKPIT__ : undefined;
  const backendUrl = (injected?.backendUrl || defaultBackendUrl()).replace(/\/+$/, '');
  return {
    backendUrl,
    token: resolveToken(),
    identity: resolveIdentity(),
    defaults: injected?.defaults,
    login: injected?.login,
    deviceLogin: injected?.deviceLogin,
    onDeviceLoginPrompt: injected?.onDeviceLoginPrompt,
    resolveToken: injected?.resolveToken,
    refreshToken: injected?.refreshToken,
    signOut: injected?.signOut,
    backendStatus: injected?.backendStatus,
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

/** True when the desktop shell exposes the RFC 8628 device-flow login bridge. */
export function hasDesktopDeviceLogin(): boolean {
  return typeof readConfig().deviceLogin === 'function';
}

/** True when the desktop shell exposes the sign-out bridge. */
export function hasDesktopSignOut(): boolean {
  return typeof readConfig().signOut === 'function';
}

/** True when the desktop shell exposes the redacted backend-phase bridge. */
export function hasDesktopBackendStatus(): boolean {
  return typeof readConfig().backendStatus === 'function';
}

/**
 * Read the redacted embedded-backend supervisor phase, or null when the bridge
 * is absent (plain browser / dev) or the call fails. Degrade-truthful: any
 * failure resolves to null so the cockpit falls back to its generic banner
 * rather than surfacing a fabricated phase.
 */
export async function readBackendStatus(): Promise<import('../types').BackendPhaseSnapshot | null> {
  const { backendStatus } = readConfig();
  if (typeof backendStatus !== 'function') return null;
  try {
    return await backendStatus();
  } catch {
    return null;
  }
}

/** The signed-in display identity (email/plan), or null when unknown. */
export function readIdentity(): CockpitIdentity | null {
  return resolveIdentity() || null;
}

/**
 * Subscribe to the device-flow prompt (user_code + verification URI) the shell
 * emits while a device login is in progress. Returns an unsubscribe function, or
 * a no-op when the bridge is unavailable (standalone browser).
 */
export function onDeviceLoginPrompt(
  callback: (prompt: import('../types').DeviceLoginPrompt) => void,
): () => void {
  const { onDeviceLoginPrompt: subscribe } = readConfig();
  if (typeof subscribe !== 'function') return () => {};
  return subscribe(callback);
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
    if (result.identity) runtimeIdentity = result.identity;
  }
  return result;
}

/**
 * Drive the desktop app's RFC 8628 device-flow sign-in. Opens the browser to
 * recoder.xyz, polls for approval, and on success stores the fresh token
 * in-memory so readConfig().token returns it for subsequent /api/conductor
 * calls. Returns a not-ok result when the bridge is unavailable or sign-in does
 * not complete — never fabricates a token.
 */
export async function runDesktopDeviceLogin(): Promise<CockpitAuthResult> {
  const { deviceLogin } = readConfig();
  if (typeof deviceLogin !== 'function') {
    return { ok: false, reason: 'no-desktop-device-login' };
  }
  const result = await deviceLogin();
  if (result.ok && result.token) {
    runtimeToken = result.token;
    if (result.identity) runtimeIdentity = result.identity;
  }
  return result;
}

/**
 * Transparently refresh an expired device token via the desktop bridge. On
 * success the fresh token (and identity, if any) is stored in-memory so
 * readConfig() returns it for subsequent /api/conductor calls. Returns a not-ok
 * result when the bridge is unavailable or refresh fails — never fakes a token.
 */
export async function runDesktopRefresh(): Promise<CockpitAuthResult> {
  const { refreshToken } = readConfig();
  if (typeof refreshToken !== 'function') {
    return { ok: false, reason: 'no-desktop-refresh' };
  }
  const result = await refreshToken();
  if (result.ok && result.token) {
    runtimeToken = result.token;
    if (result.identity) runtimeIdentity = result.identity;
  }
  return result;
}

/**
 * Sign out of the desktop app: clear the stored device token in the main
 * process AND the in-memory runtime token/identity, returning the cockpit to a
 * signed-out state. Fail-safe — even if the bridge is unavailable or the clear
 * errors, the in-memory token is dropped so the cockpit immediately re-gates on
 * auth. Always resolves; never throws.
 */
export async function runDesktopSignOut(): Promise<{ ok: boolean }> {
  const { signOut } = readConfig();
  // Drop the in-memory session FIRST so the UI gates on auth regardless of what
  // the bridge does. setRuntimeToken(undefined) clears the token; identity is
  // pinned to null so the injected identity is also suppressed post-sign-out.
  setRuntimeToken(undefined);
  runtimeIdentity = null;
  if (typeof signOut !== 'function') {
    return { ok: true };
  }
  try {
    return await signOut();
  } catch {
    // Best-effort: the in-memory token is already gone, so we are signed out.
    return { ok: true };
  }
}

/** Test/escape hatch: set the in-memory runtime token directly. */
export function setRuntimeToken(token: string | undefined): void {
  runtimeToken = token && token.trim() ? token.trim() : undefined;
}

/**
 * Test/escape hatch: set the in-memory runtime identity directly.
 * `null` suppresses the injected identity (signed-out); `undefined` falls back
 * to the injected config identity.
 */
export function setRuntimeIdentity(identity: CockpitIdentity | null | undefined): void {
  runtimeIdentity = identity;
}
