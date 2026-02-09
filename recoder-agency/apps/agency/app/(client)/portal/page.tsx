import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { db, deliverables, projects } from "@/db";
import { getClientForUser } from "@/lib/agency/get-client-for-user";
import { getCurrentUser } from "@/lib/get-current-user";

export default async function ClientPortalPage() {
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);

	if (!client) {
		return (
			<div className="text-center py-12">
				<p className="text-text-muted">
					Your account is not linked to a client profile.
				</p>
			</div>
		);
	}

	const clientProjects = await db
		.select()
		.from(projects)
		.where(eq(projects.clientDbId, client.dbId))
		.orderBy(projects.updatedAt);

	const pendingDeliverables = await db
		.select({ count: count() })
		.from(deliverables)
		.where(eq(deliverables.status, "pending_review"));

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-text">Welcome, {client.name}</h1>
				<p className="text-text-muted text-sm mt-1">
					Here&apos;s what&apos;s happening with your projects
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="rounded-xl border border-border bg-background p-5">
					<p className="text-sm text-text-muted mb-1">Active Projects</p>
					<p className="text-3xl font-bold text-text">
						{clientProjects.filter((p) => p.status !== "completed").length}
					</p>
				</div>
				<div className="rounded-xl border border-border bg-background p-5">
					<p className="text-sm text-text-muted mb-1">Pending Reviews</p>
					<p className="text-3xl font-bold text-text">
						{pendingDeliverables[0]?.count ?? 0}
					</p>
				</div>
			</div>

			<div>
				<h2 className="text-lg font-semibold text-text mb-3">
					Recent Projects
				</h2>
				<div className="grid gap-3">
					{clientProjects.slice(0, 5).map((project) => (
						<Link
							key={project.dbId}
							href={`/portal/projects/${project.id}`}
							className="rounded-xl border border-border bg-background p-4 hover:bg-bg-hover transition-colors block"
						>
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium text-text">
									{project.name}
								</span>
								<span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize bg-primary/10 text-primary">
									{project.status.replace("_", " ")}
								</span>
							</div>
						</Link>
					))}
				</div>
			</div>
		</div>
	);
}
