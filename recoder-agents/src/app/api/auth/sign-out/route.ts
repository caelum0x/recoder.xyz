import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAMES } from "@recoder/auth/edge";

export async function POST() {
  const cookieStore = await cookies();

  // Clear session cookies
  for (const name of SESSION_COOKIE_NAMES) {
    cookieStore.delete(name);
  }

  return NextResponse.json({ success: true });
}
