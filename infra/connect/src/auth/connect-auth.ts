/**
 * Recoder Connect's Better Auth instance.
 *
 * This Worker intentionally does NOT import `@recoder/auth`'s package root:
 * that entrypoint eagerly loads `./database` (a Prisma client with a native
 * query-engine binary), which cannot run in the Workers runtime. Until
 * `@recoder/auth` ships an edge-safe subpath export for its factory
 * (`createRecoderAuth` / `buildRecoderAuthOptions` in
 * `packages/auth/src/create-recoder-auth.ts` — currently not in that
 * package's `exports` map), Connect configures its own `betterAuth()`
 * instance directly against `better-auth`, matching the SAME magic-link
 * plugin and cookie approach `@recoder/auth` uses so behavior stays
 * consistent across surfaces. Follow-up: add `"./server-factory"` to
 * `packages/auth/package.json`'s `exports` and switch this file to import
 * `createRecoderAuth` from there instead of duplicating the options shape.
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
