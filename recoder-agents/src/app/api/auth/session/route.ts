import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@recoder/auth/verify";

export async function GET() {
  const cookieStore = await cookies();
  const session = await verifySession((name) => cookieStore.get(name)?.value ?? null);

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
