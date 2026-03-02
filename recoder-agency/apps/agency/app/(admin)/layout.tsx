import { ToastProvider } from "@recoder-internal/ui/toast";
import { requireCurrentTeamRole } from "@/services/teams";
import { AdminHeader } from "./ui/header";
import { AdminSidebar } from "./ui/sidebar";

export default async function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	await requireCurrentTeamRole(["admin", "member", "ops", "pm"]);

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
