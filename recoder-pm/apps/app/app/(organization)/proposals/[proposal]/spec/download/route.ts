import { currentOrganizationId } from "@repo/backend/auth/utils";
import { contentToText } from "@repo/editor/lib/tiptap";
import { database } from "@/lib/database";

export const GET = async (
  _request: Request,
  { params }: { params: { proposal: string } }
): Promise<Response> => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const proposal = await database.proposal.findFirst({
    where: { id: params.proposal, organizationId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      prdContent: true,
      taskBreakdown: true,
    },
  });

  if (!proposal) {
    return new Response("Not found", { status: 404 });
  }

  const spec = {
    id: proposal.id,
    title: proposal.title,
    description: proposal.description,
    status: proposal.status,
    prd: proposal.prdContent ? contentToText(proposal.prdContent) : "",
    tasks: proposal.taskBreakdown ?? { tasks: [] },
  };

  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename=proposal-${proposal.id}.json`,
    },
  });
};
