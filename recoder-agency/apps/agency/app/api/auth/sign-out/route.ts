import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authDb } from "@/db/auth-db";
import { authSessions } from "@/db/auth-schema";
import {
	extractSessionToken,
	parseSessionToken,
} from "@recoder/auth/edge";
import { getSignOutCookieAttributes } from "@recoder/auth/cross-domain";

export async function POST() {
	const cookieStore = await cookies();
	const rawToken = extractSessionToken(
		(name) => cookieStore.get(name)?.value ?? null,
	);
	const sessionToken = rawToken ? parseSessionToken(rawToken) : null;

	if (sessionToken) {
		await authDb
			.delete(authSessions)
			.where(eq(authSessions.token, sessionToken));
	}

	const response = NextResponse.json({ success: true });

	for (const attrs of getSignOutCookieAttributes()) {
		response.cookies.set(attrs);
	}

	return response;
}
