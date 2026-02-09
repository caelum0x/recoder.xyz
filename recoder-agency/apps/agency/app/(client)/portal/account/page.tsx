import { getClientForUser } from "@/lib/agency/get-client-for-user";
import { getCurrentUser } from "@/lib/get-current-user";

export default async function ClientAccountPage() {
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);

	return (
		<div className="max-w-2xl space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-text">Account</h1>
				<p className="text-text-muted text-sm mt-1">Your account details</p>
			</div>

			<div className="rounded-xl border border-border bg-background p-5 space-y-4">
				<div>
					<label className="block text-xs text-text-muted mb-1">Name</label>
					<p className="text-sm text-text">
						{client?.name ?? user.displayName ?? "—"}
					</p>
				</div>
				<div>
					<label className="block text-xs text-text-muted mb-1">Email</label>
					<p className="text-sm text-text">
						{client?.email ?? user.email ?? "—"}
					</p>
				</div>
				{client?.company && (
					<div>
						<label className="block text-xs text-text-muted mb-1">
							Company
						</label>
						<p className="text-sm text-text">{client.company}</p>
					</div>
				)}
			</div>
		</div>
	);
}
