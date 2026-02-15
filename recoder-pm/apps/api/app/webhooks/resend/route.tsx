import { NextResponse } from "next/server";

/**
 * Legacy Supabase auth email webhook.
 *
 * This endpoint was previously used by Supabase Auth to delegate email
 * sending (signup, magic-link, password-recovery) via a standardwebhooks
 * payload signed with SUPABASE_AUTH_HOOK_SECRET.
 *
 * With the migration to Better Auth, email delivery is handled directly
 * by the `sendMagicLink` callback in @recoder/auth (see
 * packages/backend/auth/better-auth.ts and packages/backend/email.ts).
 *
 * This route is kept as a stub so any stale Supabase config pointing
 * here receives a clear deprecation notice rather than a 404.
 */
export const POST = async () =>
  NextResponse.json(
    {
      error: {
        http_code: 410,
        message:
          "This Supabase auth webhook is deprecated. Email delivery is now handled by Better Auth.",
      },
    },
    { status: 410 }
  );
