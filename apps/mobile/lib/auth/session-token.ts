import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEYS = [
  'recoder.session_token',
  '__Secure-recoder.session_token',
  'session_token',
];

export async function getSessionAccessToken(): Promise<string | null> {
  for (const key of TOKEN_KEYS) {
    const value = await AsyncStorage.getItem(key);
    if (value) {
      return value;
    }
  }
  return null;
}

export async function requireSessionAccessToken(): Promise<string> {
  const token = await getSessionAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  return token;
}

type SessionUserIdentity = {
  id?: string;
  email?: string;
};

export type SessionTokenPayload = Record<string, unknown> & {
  sub?: string;
  user_id?: string;
  email?: string;
  locale?: string;
  user_metadata?: Record<string, unknown>;
  raw_user_meta_data?: Record<string, unknown>;
};

function decodeBase64Url(input: string): string | null {
  try {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

export async function getSessionTokenPayload(): Promise<SessionTokenPayload | null> {
  const token = await getSessionAccessToken();
  if (!token) {
    return null;
  }

  const payloadPart = token.split('.')[1];
  if (!payloadPart) {
    return null;
  }

  const decoded = decodeBase64Url(payloadPart);
  if (!decoded) {
    return null;
  }

  try {
    return JSON.parse(decoded) as SessionTokenPayload;
  } catch {
    return null;
  }
}

export async function getSessionUserIdentity(): Promise<SessionUserIdentity> {
  const payload = await getSessionTokenPayload();
  if (!payload) {
    return {};
  }

  const id =
    (typeof payload.sub === 'string' && payload.sub) ||
    (typeof payload.user_id === 'string' && payload.user_id) ||
    undefined;
  const email = typeof payload.email === 'string' ? payload.email : undefined;
  return { id, email };
}
