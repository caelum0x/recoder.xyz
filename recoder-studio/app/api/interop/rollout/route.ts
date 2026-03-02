import { NextResponse } from "next/server";
import { getStudioInteropRolloutConfig } from "@/flags";

export async function GET() {
	const rollout = await getStudioInteropRolloutConfig();
	return NextResponse.json({
		ok: true,
		rollout,
	});
}
