import { NextRequest, NextResponse } from "next/server";
import { resolveAuthBaseUrl } from "@/lib/runtime-urls";

export async function GET(request: NextRequest) {
  const authBaseUrl = resolveAuthBaseUrl();
  const cookieHeader = request.headers.get("cookie") ?? "";

  if (!cookieHeader) {
    return NextResponse.json({ data: { user: null } });
  }

  try {
    const response = await fetch(`${authBaseUrl}/api/auth/session`, {
      method: "GET",
      headers: {
        cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ data: { user: null } });
    }

    const payload = (await response.json()) as {
      user?: {
        id: string;
        email: string;
        emailVerified?: boolean;
        name?: string | null;
        image?: string | null;
      } | null;
    };

    if (!payload.user) {
      return NextResponse.json({ data: { user: null } });
    }

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
  } catch (error) {
    console.error("[session] Failed to fetch session:", error);
    return NextResponse.json({ data: { user: null } });
  }
}
