import { redirect } from "next/navigation";
import { ToastProvider } from "@recoder-internal/ui/toast";
import { fetchCurrentTeam } from "@/services/teams";
import { AdminHeader } from "./ui/header";
import { AdminSidebar } from "./ui/sidebar";

export default async function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	let team: Awaited<ReturnType<typeof fetchCurrentTeam>> | null = null;
	try {
		team = await fetchCurrentTeam();
	} catch {
		redirect("/login");
	}

	const allowedRoles = ["admin", "member", "ops", "pm"];
	if (!team?.role || !allowedRoles.includes(team.role)) {
		redirect("/login");
	}

	return (
		<ToastProvider>
			<div className="h-screen flex flex-col bg-bg">
				<AdminHeader />
				<div className="flex overflow-y-hidden flex-1">
					<AdminSidebar />
					<main className="flex-1 overflow-y-auto p-6">{children}</main>
				</div>
			</div>
		</ToastProvider>
	);
}
