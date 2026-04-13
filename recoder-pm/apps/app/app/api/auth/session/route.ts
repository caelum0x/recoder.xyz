import { cookies } from "next/headers";

type SessionCookieUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  user_metadata?: Record<string, unknown>;
};

const SESSION_DATA_COOKIE_NAMES = [
  "_Secure-recoder.session_data",
  "__Secure-recoder.session_data",
  "recoder.session_data",
] as const;

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

export const GET = async () => {
  try {
    const cookieStore = await cookies();
    const cookieUser = SESSION_DATA_COOKIE_NAMES
      .map((name) => parseSessionDataCookie(cookieStore.get(name)?.value))
      .find(Boolean);

    if (cookieUser) {
      return Response.json({
        data: {
          user: cookieUser,
        },
      });
    }

    const { getSessionUser } = await import("@repo/backend/auth/server");
    const user = await getSessionUser();

    return Response.json({
      data: {
        user,
      },
    });
  } catch (error) {
    console.error("Failed to resolve PM auth session:", error);

    return Response.json({
      data: {
        user: null,
      },
    });
  }
};
