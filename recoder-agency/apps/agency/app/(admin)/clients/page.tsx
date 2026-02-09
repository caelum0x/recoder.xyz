import { eq } from "drizzle-orm";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { clients, db } from "@/db";
import { fetchCurrentTeam } from "@/services/teams";
import { ClientDialog } from "./client-dialog";

const statusColors: Record<string, string> = {
	active: "bg-green-500/10 text-green-400",
	inactive: "bg-gray-500/10 text-gray-400",
	lead: "bg-blue-500/10 text-blue-400",
};

export default async function ClientsPage({
	searchParams,
}: {
	searchParams: Promise<{ new?: string }>;
}) {
	const params = await searchParams;
	const showNew = params.new === "1";
	const team = await fetchCurrentTeam();
	const allClients = await db
		.select()
		.from(clients)
		.where(eq(clients.teamDbId, team.dbId))
		.orderBy(clients.createdAt);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-text">Clients</h1>
					<p className="text-text-muted text-sm mt-1">
						Manage your agency clients
					</p>
				</div>
				<Link
					href="/clients?new=1"
					className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
				>
					<PlusIcon className="size-4" />
					Add Client
				</Link>
			</div>

			{showNew && <ClientDialog />}

			{allClients.length === 0 ? (
				<div className="rounded-xl border border-border bg-background p-12 text-center">
					<p className="text-text-muted text-sm">
						No clients yet. Add your first client to get started.
					</p>
				</div>
			) : (
				<div className="rounded-xl border border-border bg-background overflow-hidden">
					<table className="w-full">
						<thead>
							<tr className="border-b border-border text-left">
								<th className="px-4 py-3 text-sm font-medium text-text-muted">
									Name
								</th>
								<th className="px-4 py-3 text-sm font-medium text-text-muted">
									Company
								</th>
								<th className="px-4 py-3 text-sm font-medium text-text-muted">
									Email
								</th>
								<th className="px-4 py-3 text-sm font-medium text-text-muted">
									Status
								</th>
							</tr>
						</thead>
						<tbody>
							{allClients.map((client) => (
								<tr
									key={client.dbId}
									className="border-b border-border last:border-0 hover:bg-bg-hover transition-colors"
								>
									<td className="px-4 py-3">
										<Link
											href={`/clients/${client.id}`}
											className="text-sm font-medium text-text hover:text-primary transition-colors"
										>
											{client.name}
										</Link>
									</td>
									<td className="px-4 py-3 text-sm text-text-muted">
										{client.company ?? "\u2014"}
									</td>
									<td className="px-4 py-3 text-sm text-text-muted">
										{client.email ?? "\u2014"}
									</td>
									<td className="px-4 py-3">
										<span
											className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[client.status] ?? "bg-primary/10 text-primary"}`}
										>
											{client.status}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
