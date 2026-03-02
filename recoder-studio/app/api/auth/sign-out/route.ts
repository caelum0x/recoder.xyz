import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
	SESSION_COOKIE_NAMES,
	parseSessionToken,
} from "@recoder/auth/session";
import { authDatabase } from "@recoder/auth";

export async function POST() {
	const cookieStore = await cookies();
	const rawToken =
		cookieStore.get(SESSION_COOKIE_NAMES[0])?.value ??
		cookieStore.get(SESSION_COOKIE_NAMES[1])?.value;
	const sessionToken = rawToken ? parseSessionToken(rawToken) : null;

	if (sessionToken) {
		await authDatabase.session.deleteMany({
			where: { token: sessionToken },
		});
	}

	const response: NextResponse = NextResponse.json({ success: true });
	const isProd = process.env.NODE_ENV === "production";
	const domain = isProd ? ".recoder.xyz" : undefined;

	response.cookies.set({
		name: SESSION_COOKIE_NAMES[0],
		value: "",
		path: "/",
		maxAge: 0,
		...(domain ? { domain } : {}),
	});
	response.cookies.set({
		name: SESSION_COOKIE_NAMES[1],
		value: "",
		path: "/",
		maxAge: 0,
		...(domain ? { domain } : {}),
	});

	return response;
}
