import { authDatabase } from "@repo/backend/auth-database";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  extractSessionToken,
  parseSessionToken,
} from "@recoder/auth/edge";
import { getSignOutCookieAttributes } from "@recoder/auth/cross-domain";

export const POST = async () => {
  const cookieStore = await cookies();
  const rawToken = extractSessionToken(
    (name) => cookieStore.get(name)?.value ?? null,
  );
  const sessionToken = rawToken ? parseSessionToken(rawToken) : null;

  if (sessionToken) {
    await authDatabase.session.deleteMany({
      where: { token: sessionToken },
    });
  }

  const response = NextResponse.json({ success: true });

  for (const attrs of getSignOutCookieAttributes()) {
    response.cookies.set(attrs);
  }

  return response;
};
