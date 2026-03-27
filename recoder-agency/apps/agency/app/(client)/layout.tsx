import { ToastProvider } from "@recoder-internal/ui/toast";
import { redirect } from "next/navigation";
import { AgencyCopilot } from "@/components/agency-copilot";
import { getClientForUser } from "@/lib/agency/get-client-for-user";
import { getCurrentUser } from "@/lib/get-current-user";
import { ClientHeader } from "./ui/header";
import { ClientSidebar } from "./ui/sidebar";

export default async function ClientLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const user = await getCurrentUser();
	const client = await getClientForUser(user.dbId);
	if (!client) {
		redirect("/dashboard");
	}

	return (
		<ToastProvider>
			<div className="h-screen flex flex-col bg-bg">
				<ClientHeader />
				<div className="flex overflow-y-hidden flex-1">
					<ClientSidebar />
					<main className="flex-1 overflow-y-auto p-6">{children}</main>
				</div>
			</div>
			<AgencyCopilot />
		</ToastProvider>
	);
}
