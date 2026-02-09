import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authSessions, db } from "@/db";

export async function POST() {
	const cookieStore = await cookies();
	const sessionToken =
		cookieStore.get("better-auth.session_token")?.value ??
		cookieStore.get("__Secure-better-auth.session_token")?.value;

	if (sessionToken) {
		await db.delete(authSessions).where(eq(authSessions.token, sessionToken));
	}

	cookieStore.delete("better-auth.session_token");
	cookieStore.delete("__Secure-better-auth.session_token");

	return NextResponse.json({ success: true });
}
