import { NextResponse } from "next/server";
import { createTeamWorkspace } from "../_lib/create-team-workspace";

export async function POST(_request: Request) {
	const { redirectPath } = await createTeamWorkspace();
	return NextResponse.json({ redirectPath }, { status: 201 });
}
