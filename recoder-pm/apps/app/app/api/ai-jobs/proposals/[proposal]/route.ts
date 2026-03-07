import { currentOrganizationId } from "@repo/backend/auth/utils";
import { NextResponse } from "next/server";
import { database } from "@/lib/database";

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ proposal: string }> }
): Promise<Response> => {
  const { proposal: proposalId } = await params;
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const job = await database.aiJob.findFirst({
    where: {
      type: "PROPOSAL_PRD",
      entityId: proposalId,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      error: true,
      createdAt: true,
      updatedAt: true,
      startedAt: true,
      finishedAt: true,
    },
  });

  return NextResponse.json({ job });
};
