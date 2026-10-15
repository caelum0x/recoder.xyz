/**
 * Recoder Connect's Better Auth instance.
 *
 * This Worker intentionally does NOT import `@recoder/auth`'s package root:
 * that entrypoint eagerly loads `./database` (a Prisma client with a native
 * query-engine binary), which cannot run in the Workers runtime.
 *
 * Update 2026-10-16: `packages/auth` DOES now ship an edge-safe subpath
 * export (`"./core"` → `create-recoder-auth.ts`, confirmed Prisma-free) —
 * the older note below about a missing `"./server-factory"` export is
 * stale, that work landed under a different path name. Still NOT adopted
 * here on purpose: `createRecoderAuth`'s shared `RECODER_COOKIE_ADVANCED`
 * hardcodes `cookiePrefix: "recoder"` with cross-subdomain cookies enabled
 * for `.recoder.xyz` — switching to it would make Connect's session cookie
 * literally the same name/domain as the main recoder.xyz app's Better Auth
 * session (a DIFFERENT database, DIFFERENT user base), which is a session-
 * collision risk, not a cleanup. `packages/auth`'s factory would need its
 * cookie config parameterized per caller before this Worker could safely
 * adopt it — until then, this file intentionally keeps its own
 * `cookiePrefix: "recoder_connect"` (no cross-subdomain cookies), matching
 * the SAME magic-link plugin approach `@recoder/auth` uses so behavior
 * stays otherwise consistent across surfaces.
 *
 * The database adapter is a plain `pg.Pool` (reached through the Hyperdrive
 * binding) — better-auth's built-in Kysely dialect accepts a raw `Pool`
 * directly, no ORM adapter needed.
 */
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { Pool } from 'pg';
import type { ConnectEnv } from '../env.js';
import { scribaseMailCredential } from '../env.js';
import { createScribaseMailSender, magicLinkEmail } from '../mail/scribase-mail.js';

export function createConnectAuth(env: ConnectEnv, pool: Pool) {
  const mailCredential = scribaseMailCredential(env);
  const sender = createScribaseMailSender(mailCredential);

  return betterAuth({
    database: pool,
    baseURL: env.BETTER_AUTH_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    advanced: {
      cookiePrefix: 'recoder_connect',
      useSecureCookies: true,
      generateId: () => crypto.randomUUID(),
    },
    emailAndPassword: { enabled: false },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          const email_ = magicLinkEmail(url);
          const result = await sender.send({
            to: email,
            subject: email_.subject,
            html: email_.html,
            text: email_.text,
            idempotencyKey: `connect-magic-link:${email}:${url}`,
          });
          if (!result.ok) {
            // Thrown so better-auth's own sign-in-link endpoint reports a real
            // failure to the caller instead of a false "check your email".
            throw new Error(`failed to send magic link: ${result.reason}`);
          }
        },
      }),
    ],
    trustedOrigins: [env.APP_URL, env.CONNECT_URL],
  });
}

export type ConnectAuth = ReturnType<typeof createConnectAuth>;
