import { eq } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { clients, db } from "@/db";
import { fetchCurrentTeam } from "@/services/teams";
import { createQuote } from "../actions";

export default async function NewQuotePage() {
	const team = await fetchCurrentTeam();

	const teamClients = await db
		.select({ id: clients.id, name: clients.name, company: clients.company })
		.from(clients)
		.where(eq(clients.teamDbId, team.dbId))
		.orderBy(clients.name);

	return (
		<div className="space-y-6 max-w-2xl">
			<div className="flex items-center gap-3">
				<Link
					href="/quotes"
					className="text-text-muted hover:text-text transition-colors"
				>
					<ArrowLeftIcon className="size-4" />
				</Link>
				<h1 className="text-2xl font-bold text-text">New Quote</h1>
			</div>

			<form
				action={createQuote}
				className="rounded-xl border border-border bg-background p-6 space-y-4"
			>
				<div>
					<label
						htmlFor="quote-client"
						className="block text-sm font-medium text-text mb-1"
					>
						Client *
					</label>
					<select
						id="quote-client"
						name="clientId"
						required
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
					>
						<option value="">Select a client...</option>
						{teamClients.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
								{c.company ? ` (${c.company})` : ""}
							</option>
						))}
					</select>
				</div>

				<div>
					<label
						htmlFor="quote-title"
						className="block text-sm font-medium text-text mb-1"
					>
						Title *
					</label>
					<input
						id="quote-title"
						name="title"
						required
						placeholder="e.g. Website Redesign Proposal"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text"
					/>
				</div>

				<div className="flex gap-3">
					<button
						type="submit"
						className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
					>
						Create Quote
					</button>
					<Link
						href="/quotes"
						className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-bg-hover transition-colors"
					>
						Cancel
					</Link>
				</div>
			</form>
		</div>
	);
}
