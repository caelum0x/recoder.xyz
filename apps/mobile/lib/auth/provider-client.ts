import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthProviderApiBase, getAuthProviderOrigin } from '@/api/auth-provider';
import { getSessionAccessToken } from '@/lib/auth/session-token';
import { log } from '@/lib/logger';
import {
  parseAuthProviderError,
  parseAuthProviderJson,
  parseAuthProviderProfileResponse,
  readAuthProviderErrorMessage,
} from '@/lib/auth/contracts';
import type { AuthSession, AuthUser } from '@/lib/utils/auth-types';

export type AuthProviderAuthChangeEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | string;

export type AuthProviderSession = AuthSession;
export type AuthProviderUser = AuthUser;

type BasicErrorResponse = { message: string; status?: number };
type AuthChangeCallback = (
  event: AuthProviderAuthChangeEvent,
  session: AuthProviderSession | null
) => void | Promise<void>;

type Subscription = { unsubscribe: () => void };

const ACCESS_TOKEN_KEYS = [
  'recoder.session_token',
  '__Secure-recoder.session_token',
  'session_token',
] as const;
const REFRESH_TOKEN_KEY = 'recoder.refresh_token';

const listeners = new Set<AuthChangeCallback>();
let currentSession: AuthProviderSession | null = null;
let initialized = false;

// ---------------------------------------------------------------------------
// Token helpers (unchanged — client-side only)
// ---------------------------------------------------------------------------

function decodeBase64Url(input: string): string | null {
  try {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

function decodeTokenPayload(token?: string | null): Record<string, unknown> | null {
  if (!token) return null;
  const payloadPart = token.split('.')[1];
  if (!payloadPart) return null;
  const decoded = decodeBase64Url(payloadPart);
  if (!decoded) return null;
  try {
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function userFromToken(token?: string | null): AuthProviderUser | null {
  const payload = decodeTokenPayload(token);
  if (!payload) return null;

  const id =
    (typeof payload.sub === 'string' && payload.sub) ||
    (typeof payload.user_id === 'string' && payload.user_id) ||
    '';
  if (!id) return null;

  const email = typeof payload.email === 'string' ? payload.email : undefined;
  const userMetadata =
    (payload.user_metadata as Record<string, unknown> | undefined) ||
    (payload.raw_user_meta_data as Record<string, unknown> | undefined);

  return {
    id,
    email,
    user_metadata: userMetadata || {},
  };
}

// ---------------------------------------------------------------------------
// Response normalisation — converts better-auth responses to the shape that
// the rest of the app expects (access_token / refresh_token / user).
// ---------------------------------------------------------------------------

function normalizeBetterAuthPayload(raw: Record<string, any>): Record<string, any> {
  const session = raw.session;
  const user = raw.user;

  // Standard better-auth response: { session: { token, ... }, user: { ... } }
  if (session?.token) {
    return {
      access_token: session.token,
      refresh_token: session.token,
      user: user
        ? {
            id: user.id,
            email: user.email,
            user_metadata: {
              full_name: user.name,
              ...(user.image ? { avatar_url: user.image } : {}),
            },
          }
        : undefined,
    };
  }

  // Some endpoints return { token, user } directly
  if (raw.token && typeof raw.token === 'string') {
    return {
      access_token: raw.token,
      refresh_token: raw.token,
      user: user
        ? {
            id: user.id,
            email: user.email,
            user_metadata: {
              full_name: user.name,
              ...(user.image ? { avatar_url: user.image } : {}),
            },
          }
        : undefined,
    };
  }

  // Already in legacy format (or opaque payload)
  return raw;
}

function normalizeSessionPayload(data: Record<string, any>): AuthProviderSession | null {
  const accessToken = data.access_token as string | undefined;
  if (!accessToken) return null;

  const user = (data.user as AuthProviderUser | undefined) || userFromToken(accessToken);
  return {
    access_token: accessToken,
    refresh_token: (data.refresh_token as string | undefined) || undefined,
    user: user || null,
  };
}

// ---------------------------------------------------------------------------
// Token persistence
// ---------------------------------------------------------------------------

async function saveTokens(accessToken: string, refreshToken?: string | null): Promise<void> {
  await Promise.all([
    ...ACCESS_TOKEN_KEYS.map((key) => AsyncStorage.setItem(key, accessToken)),
    refreshToken ? AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken) : Promise.resolve(),
  ]);
}

async function clearTokens(): Promise<void> {
  await Promise.all([
    ...ACCESS_TOKEN_KEYS.map((key) => AsyncStorage.removeItem(key)),
    AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
  ]);
}

// ---------------------------------------------------------------------------
// Event bus
// ---------------------------------------------------------------------------

function emit(event: AuthProviderAuthChangeEvent, session: AuthProviderSession | null): void {
  currentSession = session;
  for (const callback of listeners) {
    Promise.resolve(callback(event, session)).catch(() => {});
  }
}

function makeError(message: string, status?: number): BasicErrorResponse {
  return { message, status };
}

// ---------------------------------------------------------------------------
// HTTP helpers — talk to better-auth via the frontend
// ---------------------------------------------------------------------------

function baseHeaders(token?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseJson(response: Response): Promise<Record<string, any>> {
  const rawPayload = await response.json().catch(() => null);
  const payload = parseAuthProviderJson(rawPayload);
  if (!payload) {
    log.warn('[auth-provider] non-object response payload');
    return {};
  }
  return payload as Record<string, any>;
}

async function authPost(path: string, body: Record<string, unknown>, token?: string) {
  const response = await fetch(`${getAuthProviderApiBase()}${path}`, {
    method: 'POST',
    headers: baseHeaders(token),
    body: JSON.stringify(body),
  });
  const raw = await parseJson(response);
  if (!response.ok) {
    const err = parseAuthProviderError(raw) || raw;
    return {
      data: null,
      error: makeError(
        readAuthProviderErrorMessage(err) || 'Authentication request failed',
        response.status
      ),
    };
  }
  const payload = normalizeBetterAuthPayload(raw);
  return { data: payload, error: null as BasicErrorResponse | null };
}

// ---------------------------------------------------------------------------
// Session hydration
// ---------------------------------------------------------------------------

async function getCurrentTokenPair() {
  const accessToken = await getSessionAccessToken();
  const refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  return { accessToken, refreshToken };
}

async function hydrateSession(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const { accessToken, refreshToken } = await getCurrentTokenPair();
  if (accessToken) {
    currentSession = {
      access_token: accessToken,
      refresh_token: refreshToken || undefined,
      user: userFromToken(accessToken),
    };
  }
}

async function storeAndEmitFromPayload(
  payload: Record<string, any>,
  event: AuthProviderAuthChangeEvent
) {
  const session = normalizeSessionPayload(payload);
  if (!session?.access_token) {
    return { data: payload, error: null as BasicErrorResponse | null };
  }
  await saveTokens(session.access_token, session.refresh_token);
  emit(event, session);
  return { data: payload, error: null as BasicErrorResponse | null };
}

// ---------------------------------------------------------------------------
// Public client
// ---------------------------------------------------------------------------

export const authProviderClient = {
  onAuthStateChange(callback: AuthChangeCallback): { data: { subscription: Subscription } } {
    listeners.add(callback);
    void hydrateSession().then(() => callback('INITIAL_SESSION', currentSession));
    return {
      data: {
        subscription: {
          unsubscribe: () => listeners.delete(callback),
        },
      },
    };
  },

  // ---- Email / password ----------------------------------------------------

  signInWithPassword(email: string, password: string) {
    return (async () => {
      const result = await authPost('/sign-in/email', {
        email: email.trim().toLowerCase(),
        password,
      });
      if (result.error || !result.data) {
        return { data: { user: null, session: null }, error: result.error };
      }
      await storeAndEmitFromPayload(result.data, 'SIGNED_IN');
      const session = normalizeSessionPayload(result.data);
      return { data: { user: session?.user ?? null, session }, error: null as BasicErrorResponse | null };
    })();
  },

  signUp(email: string, password: string, fullName?: string) {
    return (async () => {
      const result = await authPost('/sign-up/email', {
        email: email.trim().toLowerCase(),
        password,
        name: fullName || '',
      });
      if (result.error || !result.data) {
        return { data: { user: null, session: null }, error: result.error };
      }
      const session = normalizeSessionPayload(result.data);
      if (session) {
        await saveTokens(session.access_token as string, session.refresh_token);
        emit('SIGNED_IN', session);
      }
      return {
        data: {
          user: (result.data.user as AuthProviderUser) || session?.user || null,
          session,
        },
        error: null as BasicErrorResponse | null,
      };
    })();
  },

  // ---- Native ID-token (Apple Sign In on iOS) ------------------------------

  signInWithIdToken(provider: 'apple', token: string) {
    return (async () => {
      const result = await authPost('/sign-in/social', {
        provider,
        idToken: token,
      });
      if (result.error || !result.data) {
        return { data: { user: null, session: null }, error: result.error };
      }
      await storeAndEmitFromPayload(result.data, 'SIGNED_IN');
      const session = normalizeSessionPayload(result.data);
      return { data: { user: session?.user ?? null, session }, error: null as BasicErrorResponse | null };
    })();
  },

  // ---- OAuth (browser redirect flow) ---------------------------------------

  signInWithOAuth(provider: 'google' | 'github' | 'apple', redirectTo: string) {
    const origin = getAuthProviderOrigin();
    // Build the callback chain:
    //   better-auth OAuth callback
    //     → /api/auth/mobile-callback  (reads cookie, extracts token)
    //     → recoder://auth/callback?access_token=<token>
    const bridgeUrl = `${origin}/api/auth/mobile-callback?returnUrl=${encodeURIComponent(redirectTo)}`;
    const url = `${getAuthProviderApiBase()}/sign-in/social?provider=${encodeURIComponent(provider)}&callbackURL=${encodeURIComponent(bridgeUrl)}`;
    return Promise.resolve({
      data: { provider, url },
      error: null as BasicErrorResponse | null,
    });
  },

  // ---- Session management --------------------------------------------------

  setSession(access_token: string, refresh_token: string) {
    return (async () => {
      const token = access_token?.trim();
      if (!token) {
        return { data: { user: null, session: null }, error: makeError('Missing access token') };
      }
      const session: AuthProviderSession = {
        access_token: token,
        refresh_token: refresh_token?.trim() || undefined,
        user: userFromToken(token),
      };
      await saveTokens(token, session.refresh_token);
      emit('SIGNED_IN', session);
      return { data: { user: session.user, session }, error: null as BasicErrorResponse | null };
    })();
  },

  exchangeCodeForSession(code: string) {
    return (async () => {
      // With better-auth + the mobile-callback bridge, the mobile app receives
      // a session token directly (not a code).  Try to validate the code as a
      // session token by calling the session endpoint.
      try {
        const response = await fetch(`${getAuthProviderApiBase()}/get-session`, {
          method: 'GET',
          headers: baseHeaders(code),
        });
        if (response.ok) {
          const raw = await parseJson(response);
          const data = normalizeBetterAuthPayload(raw);
          await storeAndEmitFromPayload(data, 'SIGNED_IN');
          const session = normalizeSessionPayload(data);
          return { data: { user: session?.user ?? null, session }, error: null as BasicErrorResponse | null };
        }
      } catch {
        // Fall through to direct-use path
      }

      // Fallback: treat the code as a usable token (e.g. if it is a JWT)
      const user = userFromToken(code);
      if (user) {
        const session: AuthProviderSession = {
          access_token: code,
          refresh_token: code,
          user,
        };
        await saveTokens(code, code);
        emit('SIGNED_IN', session);
        return { data: { user, session }, error: null as BasicErrorResponse | null };
      }

      return { data: { user: null, session: null }, error: makeError('Invalid session code', 401) };
    })();
  },

  // ---- Magic link -----------------------------------------------------------

  signInWithOtp(email: string, emailRedirectTo: string) {
    return authPost('/sign-in/magic-link', {
      email: email.trim().toLowerCase(),
      callbackURL: emailRedirectTo,
    });
  },

  // ---- Password reset -------------------------------------------------------

  resetPasswordForEmail(email: string, _redirectTo: string) {
    return authPost('/forget-password', {
      email: email.trim().toLowerCase(),
      redirectTo: _redirectTo,
    });
  },

  // ---- User updates ---------------------------------------------------------

  updateUser(data: { password?: string; data?: Record<string, unknown> }) {
    return (async () => {
      const token = await getSessionAccessToken();
      if (!token) {
        return { data: null, error: makeError('Not authenticated', 401) };
      }

      // Password change
      if (data.password) {
        const pwResult = await authPost('/change-password', {
          newPassword: data.password,
        }, token);
        if (pwResult.error) {
          return { data: null, error: pwResult.error };
        }
      }

      // Metadata / profile update
      if (data.data) {
        const updatePayload: Record<string, unknown> = {};
        if (data.data.full_name) updatePayload.name = data.data.full_name;
        if (data.data.avatar_url) updatePayload.image = data.data.avatar_url;

        if (Object.keys(updatePayload).length > 0) {
          const result = await authPost('/update-user', updatePayload, token);
          if (result.error) {
            return { data: null, error: result.error };
          }

          const updatedUser = result.data?.user || null;
          const existing = currentSession ?? {
            access_token: token,
            user: userFromToken(token),
          };
          const nextSession: AuthProviderSession = {
            ...existing,
            user: updatedUser || existing.user,
          };
          emit('USER_UPDATED', nextSession);
          return { data: result.data, error: null as BasicErrorResponse | null };
        }
      }

      return { data: {}, error: null as BasicErrorResponse | null };
    })();
  },

  updateProfileName(name: string) {
    return (async () => {
      const endpoint = `${getAuthProviderOrigin()}/api/user/profile`;
      try {
        const token = await getSessionAccessToken();
        if (token) {
          const response = await fetch(endpoint, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ name }),
          });
          if (response.ok) {
            const payload = parseAuthProviderProfileResponse(await response.json().catch(() => null));
            if (!payload) {
              log.warn('[auth-provider] invalid /api/user/profile response payload');
            }
            const existing = currentSession ?? {
              access_token: token,
              user: userFromToken(token),
            };
            const nextSession: AuthProviderSession = {
              ...existing,
              user: existing.user
                ? {
                    ...existing.user,
                    user_metadata: {
                      ...(existing.user.user_metadata || {}),
                      full_name: name,
                    },
                  }
                : existing.user,
            };
            emit('USER_UPDATED', nextSession);
            return { data: payload, error: null as BasicErrorResponse | null };
          }
        }
      } catch {
        // Fall through to update-user
      }

      return this.updateUser({
        data: {
          full_name: name,
        },
      });
    })();
  },

  // ---- Sign out -------------------------------------------------------------

  signOut(scope: 'global' | 'local') {
    return (async () => {
      if (scope === 'global') {
        try {
          const token = await getSessionAccessToken();
          if (token) {
            const response = await fetch(`${getAuthProviderApiBase()}/sign-out`, {
              method: 'POST',
              headers: baseHeaders(token),
            });
            if (!response.ok) {
              const payload = await parseJson(response);
              const err = payload?.error || payload;
              return {
                error: makeError(
                  err?.message || err?.error_description || 'Sign out failed',
                  response.status
                ),
              };
            }
          }
        } catch (error: any) {
          return { error: makeError(error?.message || 'Sign out failed') };
        }
      }

      await clearTokens();
      emit('SIGNED_OUT', null);
      return { error: null as BasicErrorResponse | null };
    })();
  },
};
