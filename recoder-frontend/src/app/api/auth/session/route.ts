import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE_NAMES } from "@recoder/auth/session";

export async function GET() {
  const cookieStore = await cookies();
  const rawToken =
    cookieStore.get(SESSION_COOKIE_NAMES[0])?.value ??
    cookieStore.get(SESSION_COOKIE_NAMES[1])?.value;

  if (!rawToken) {
    return NextResponse.json({ data: { user: null } });
  }

  const session = await verifySessionToken(rawToken);

  if (!session) {
    return NextResponse.json({ data: { user: null } });
  }

  return NextResponse.json({
    data: {
      user: {
        id: session.userId,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        name: session.user.name,
        image: session.user.image,
      },
    },
  });
}
