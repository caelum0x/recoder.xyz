import { eq } from "drizzle-orm";
import Link from "next/link";
import { db, projects } from "@/db";
import { getClientForUser } from "@/lib/agency/get-client-for-user";
import { getCurrentUser } from "@/lib/get-current-user";

export default async function ClientProjectsPage() {
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);

	if (!client) {
		return (
			<div className="text-center py-12">
				<p className="text-text-muted">No client profile found.</p>
			</div>
		);
	}

	const clientProjects = await db
		.select()
		.from(projects)
		.where(eq(projects.clientDbId, client.dbId))
		.orderBy(projects.updatedAt);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-text">My Projects</h1>
				<p className="text-text-muted text-sm mt-1">
					Track the progress of your projects
				</p>
			</div>

			{clientProjects.length === 0 ? (
				<div className="rounded-xl border border-border bg-background p-12 text-center">
					<p className="text-text-muted text-sm">
						No projects yet. Submit a brief to get started.
					</p>
					<Link
						href="/portal/briefs/new"
						className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors mt-4"
					>
						Submit a Brief
					</Link>
				</div>
			) : (
				<div className="grid gap-3">
					{clientProjects.map((project) => (
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
							{project.brief && (
								<p className="text-xs text-text-muted mt-1 line-clamp-2">
									{project.brief}
								</p>
							)}
						</Link>
					))}
				</div>
			)}
		</div>
	);
}
