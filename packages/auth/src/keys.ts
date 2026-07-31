/**
 * Environment variable validation for @recoder/auth.
 *
 * Required env vars:
 *   BETTER_AUTH_SECRET  — signing secret for sessions
 *   BETTER_AUTH_URL     — base URL for auth callbacks (e.g. https://recoder.xyz)
 *   AUTH_DATABASE_URL   — PostgreSQL connection string for auth tables
 *
 * Optional env vars:
 *   GITHUB_APP_CLIENT_ID / GITHUB_APP_CLIENT_SECRET
 *   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
 */

export interface AuthEnv {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  AUTH_DATABASE_URL: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
}

/**
 * Validate and return required auth environment variables.
 *
 * Always fails fast (throws) when a required secret/URL is missing — in EVERY
 * environment, including Docker. Never returns an empty-string secret: an empty
 * `BETTER_AUTH_SECRET` would let better-auth sign and verify sessions with no
 * real secret, making sessions forgeable. This is a fail-safe boundary, so a
 * missing secret must stop the process rather than boot silently insecure.
 *
 * (`getAuthEnv` is only reached when auth is actually being constructed — e.g.
 * `createAuth()`. The Docker image `build` step is `prisma generate`, which
 * never imports this module, so there is no legitimate build-time path that
 * needs empty secrets.)
 */
export function getAuthEnv(): AuthEnv {
  const missing: string[] = [];
  if (!process.env.BETTER_AUTH_SECRET) missing.push("BETTER_AUTH_SECRET");
  if (!process.env.BETTER_AUTH_URL) missing.push("BETTER_AUTH_URL");
  if (!process.env.AUTH_DATABASE_URL) missing.push("AUTH_DATABASE_URL");

  if (missing.length > 0) {
    throw new Error(
      `@recoder/auth: Missing required environment variables: ${missing.join(", ")}`
    );
  }

  return {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL!,
    AUTH_DATABASE_URL: process.env.AUTH_DATABASE_URL!,
    GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
    GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET,
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  };
}
