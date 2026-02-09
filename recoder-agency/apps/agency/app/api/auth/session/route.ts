import { NextResponse } from "next/server";
import { getSessionUserOrNull } from "@/lib/auth/server";

export async function GET() {
	const user = await getSessionUserOrNull();
	return NextResponse.json({ data: { user } });
}
