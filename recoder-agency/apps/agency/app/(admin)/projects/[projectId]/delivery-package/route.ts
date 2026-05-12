import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, deliverables, projects, workspaces } from "@/db";
import { buildRecoderProjectDeliveryPackage } from "@/lib/agency/recoder-control-plane";
import { requireAdminRole } from "@/services/teams";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ projectId: string }> },
) {
	const { projectId } = await params;
	const team = await requireAdminRole();

	const project = await db.query.projects.findFirst({
		where: and(eq(projects.id, projectId), eq(projects.teamDbId, team.dbId)),
	});
	if (!project) {
		return NextResponse.json({ error: "Project not found" }, { status: 404 });
	}

	const [projectDeliverables, projectWorkspace] = await Promise.all([
		db
			.select()
			.from(deliverables)
			.where(eq(deliverables.projectDbId, project.dbId))
			.orderBy(deliverables.phaseOrder, deliverables.createdAt),
		project.workspaceDbId
			? db.query.workspaces.findFirst({
					where: eq(workspaces.dbId, project.workspaceDbId),
				})
			: Promise.resolve(null),
	]);

	const deliveryPackage = await buildRecoderProjectDeliveryPackage({
		projectId: project.id,
		projectName: project.name,
		workspaceId: projectWorkspace?.id ?? null,
		deliverables: projectDeliverables.map((deliverable) => ({
			id: deliverable.id,
			name: deliverable.name,
			status: deliverable.status,
			type: deliverable.type,
			taskId: deliverable.taskId,
			fileKey: deliverable.fileKey,
			milestoneLabel: deliverable.milestoneLabel,
			content: deliverable.content,
		})),
	});

	return new NextResponse(JSON.stringify(deliveryPackage, null, 2), {
		status: 200,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Content-Disposition": `attachment; filename=\"${project.id}-delivery-package.json\"`,
		},
	});
}
