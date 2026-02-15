import { authDatabase } from "@repo/backend/auth-database";
import { database } from "@repo/backend/database";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

function sanitizeRedirectPath(raw: string | null): string {
  if (!raw) {
    return "/";
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) {
    return "/";
  }
  if (trimmed.startsWith("//")) {
    return "/";
  }
  if (trimmed.includes("\\")) {
    return "/";
  }
  if (trimmed.includes(":")) {
    return "/";
  }
  if (trimmed.includes("@")) {
    return "/";
  }
  return trimmed;
}

function getSessionCookieNameAndFlags() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    cookieName: isProd
      ? "__Secure-recoder.session_token"
      : "recoder.session_token",
    cookieDomain: isProd ? "; Domain=.recoder.xyz" : "",
    cookieSecure: isProd ? "; Secure" : "",
    sameSite: isProd ? "None" : "Lax",
  };
}

function getRequestIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip")
  );
}

function buildAuthRedirectResponse(
  path: string,
  sessionToken: string
): Response {
  const { cookieName, cookieDomain, cookieSecure, sameSite } =
    getSessionCookieNameAndFlags();
  return new Response(null, {
    status: 302,
    headers: {
      Location: path,
      "Set-Cookie": `${cookieName}=${sessionToken}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${60 * 60 * 24 * 7}${cookieSecure}${cookieDomain}`,
    },
  });
}

export const GET = async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const next = sanitizeRedirectPath(searchParams.get("next"));

  if (!(token && email)) {
    redirect("/sign-in?error=invalid_link");
  }

  const verification = await authDatabase.verification.findFirst({
    where: {
      identifier: email,
      value: token,
      expiresAt: { gt: new Date() },
    },
  });
  if (!verification) {
    redirect("/sign-in?error=invalid_link");
  }

  await authDatabase.verification.delete({
    where: { id: verification.id },
  });

  const user = await authDatabase.user.findUnique({
    where: { email },
  });
  if (!user) {
    redirect("/sign-in?error=invalid_link");
  }

  await authDatabase.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });

  await database.authUser.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email,
      emailVerified: true,
      name: user.name,
      imageUrl: user.image,
      organizationRole: "MEMBER",
    },
    update: {
      email: user.email,
      emailVerified: true,
      name: user.name,
      imageUrl: user.image,
    },
  });

  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await authDatabase.session.create({
    data: {
      userId: user.id,
      token: sessionToken,
      expiresAt,
      updatedAt: new Date(),
      ipAddress: getRequestIp(request),
      userAgent: request.headers.get("user-agent"),
    },
  });

  return buildAuthRedirectResponse(next, sessionToken);
};
