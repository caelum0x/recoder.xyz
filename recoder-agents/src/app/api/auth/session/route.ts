import { NextRequest, NextResponse } from "next/server";
import { resolveAuthBaseUrl } from "@/lib/runtime-urls";
import {
  extractSessionTokenFromHeader,
  verifySession as verifySessionFromDB,
} from "@recoder/auth";

type SessionCookieUser = {
  id: string;
  email: string;
  emailVerified?: boolean;
  name?: string | null;
  image?: string | null;
  imageUrl?: string | null;
};

const SESSION_DATA_COOKIE_NAMES = [
  "_Secure-recoder.session_data",
  "__Secure-recoder.session_data",
  "recoder.session_data",
] as const;

function getCookieValue(cookieHeader: string, name: string) {
  const escaped = name.replace(/\./g, "\\.");
  const re = new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`);
  const match = cookieHeader.match(re);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function parseSessionDataCookie(rawValue: string | null | undefined) {
  if (!rawValue) {
    return null;
  }

  try {
    const decoded = Buffer.from(rawValue, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as {
      session?: { user?: SessionCookieUser };
    };

    return parsed.session?.user ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const authBaseUrl = resolveAuthBaseUrl();
  const cookieHeader = request.headers.get("cookie") ?? "";

  if (!cookieHeader) {
    return NextResponse.json({ data: { user: null } });
  }

  const cookieUser = SESSION_DATA_COOKIE_NAMES
    .map((name) => parseSessionDataCookie(getCookieValue(cookieHeader, name)))
    .find(Boolean);

  if (cookieUser) {
    return NextResponse.json({
      data: {
        user: {
          id: cookieUser.id,
          email: cookieUser.email,
          emailVerified: cookieUser.emailVerified ?? true,
          name: cookieUser.name ?? null,
          image: cookieUser.image ?? cookieUser.imageUrl ?? null,
        },
      },
    });
  }

  // --- Primary path: proxy to the main site's Better Auth session endpoint ---
  try {
    const response = await fetch(`${authBaseUrl}/api/auth/session`, {
      method: "GET",
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        user?: {
          id: string;
          email: string;
          emailVerified?: boolean;
          name?: string | null;
          image?: string | null;
        } | null;
      };

      if (payload.user) {
        return NextResponse.json({
          data: {
            user: {
              id: payload.user.id,
              email: payload.user.email,
              emailVerified: payload.user.emailVerified ?? true,
              name: payload.user.name ?? null,
              image: payload.user.image ?? null,
            },
          },
        });
      }
    }
  } catch (error) {
    console.error("[session] Better Auth proxy failed:", error);
  }

  // --- Fallback: direct DB lookup via @recoder/auth ---
  // This handles the case where Better Auth's cookie-cache layer fails
  // (e.g. server-side proxy requests that lack the signed cache cookie).
  try {
    const token = extractSessionTokenFromHeader(cookieHeader);
    if (token) {
      const authSession = await verifySessionFromDB(
        (name) => {
          return getCookieValue(cookieHeader, name);
        },
      );

      if (authSession?.user) {
        return NextResponse.json({
          data: {
            user: {
              id: authSession.user.id,
              email: authSession.user.email,
              emailVerified: authSession.user.emailVerified ?? true,
              name: authSession.user.name ?? null,
              image: authSession.user.image ?? null,
            },
          },
        });
      }
    }
  } catch (error) {
    console.error("[session] DB fallback error:", error);
  }

  return NextResponse.json({ data: { user: null } });
}
