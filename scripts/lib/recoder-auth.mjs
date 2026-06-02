import fs from 'node:fs';

const AUTH_SOURCE = new URL('../e2e-agents-auth.mjs', import.meta.url);
const AUTH_TEXT = fs.readFileSync(AUTH_SOURCE, 'utf8');

function extractConst(name) {
  const match = AUTH_TEXT.match(new RegExp(`const ${name} = "([^"]+)"`));
  if (!match) {
    throw new Error(`Could not extract ${name} from ${AUTH_SOURCE.pathname}`);
  }
  return match[1];
}

export const SESSION_DATA = extractConst('SESSION_DATA');
export const SESSION_TOKEN = decodeURIComponent(extractConst('SESSION_TOKEN'));

function parseSessionUserId(sessionData) {
  const parsed = JSON.parse(Buffer.from(sessionData, 'base64url').toString('utf8'));
  return parsed?.session?.user?.id || parsed?.session?.session?.userId || null;
}

function parseSessionExpiry(sessionData) {
  const parsed = JSON.parse(Buffer.from(sessionData, 'base64url').toString('utf8'));
  const expiresAt =
    parsed?.expiresAt
    ?? parsed?.session?.expiresAt
    ?? parsed?.session?.session?.expiresAt
    ?? null;

  if (typeof expiresAt === 'number' && Number.isFinite(expiresAt)) {
    const seconds = Math.floor(expiresAt / 1000);
    if (seconds > Math.floor(Date.now() / 1000)) {
      return seconds;
    }
  }

  if (typeof expiresAt === 'string') {
    const ms = Date.parse(expiresAt);
    if (Number.isFinite(ms)) {
      const seconds = Math.floor(ms / 1000);
      if (seconds > Math.floor(Date.now() / 1000)) {
        return seconds;
      }
    }
  }

  return Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000);
}

export const SESSION_USER_ID = parseSessionUserId(SESSION_DATA);
export const SESSION_EXPIRES = parseSessionExpiry(SESSION_DATA);

export function buildRecoderCookieHeader() {
  return [
    `_Secure-recoder.session_data=${SESSION_DATA}`,
    `recoder.session_token=${encodeURIComponent(SESSION_TOKEN)}`,
    `__Secure-recoder.session_token=${encodeURIComponent(SESSION_TOKEN)}`,
  ].join('; ');
}

export async function addRecoderAuthCookies(context) {
  const expires = SESSION_EXPIRES;
  await context.addCookies([
    {
      name: '_Secure-recoder.session_data',
      value: SESSION_DATA,
      domain: '.recoder.xyz',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'None',
      expires,
    },
    {
      name: 'recoder.session_token',
      value: SESSION_TOKEN,
      domain: '.recoder.xyz',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      expires,
    },
    {
      name: '__Secure-recoder.session_token',
      value: SESSION_TOKEN,
      domain: '.recoder.xyz',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      expires,
    },
  ]);
}
