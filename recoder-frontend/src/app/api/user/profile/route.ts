import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authDatabase } from "@recoder/auth";
import { SESSION_COOKIE_NAMES, verifySessionToken } from "@recoder/auth/session";

type ProfilePatchBody = {
  name?: string | null;
  image?: string | null;
};

function sanitizeName(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}

function sanitizeImage(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 2_000_000);
}

export async function PATCH(request: NextRequest) {
  const cookieStore = await cookies();
  const rawToken =
    cookieStore.get(SESSION_COOKIE_NAMES[0])?.value ??
    cookieStore.get(SESSION_COOKIE_NAMES[1])?.value;

  if (!rawToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await verifySessionToken(rawToken);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ProfilePatchBody;
  const name = sanitizeName(body?.name);
  const image = sanitizeImage(body?.image);

  const updateData: { name?: string | null; image?: string | null } = {};
  if (name !== undefined) updateData.name = name;
  if (image !== undefined) updateData.image = image;

  if (!Object.keys(updateData).length) {
    return NextResponse.json({ error: "No profile fields to update" }, { status: 400 });
  }

  const updatedUser = await authDatabase.user.update({
    where: { id: session.userId },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      emailVerified: true,
    },
  });

  return NextResponse.json({
    data: {
      user: updatedUser,
    },
  });
}
