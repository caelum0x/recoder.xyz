import { ToastProvider } from "@recoder-internal/ui/toast";
import { SentryUserWrapper } from "@/components/sentry-user-wrapper";
import { InternalRecoderStudioClientProvider } from "./internal-recoder-studio-client-provider";
import { InteropPanel } from "./interop/components/interop-panel";
import { Header } from "./ui/header";
import { Sidebar } from "./ui/sidebar";
import { TaskOverlay } from "./ui/task-overlay";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<SentryUserWrapper>
			<ToastProvider>
				<InternalRecoderStudioClientProvider>
					<div className="h-screen flex flex-col bg-bg">
						<Header />
						<div className="flex overflow-y-hidden divide-x divide-border flex-1">
							<Sidebar />
							<main className="flex-1 overflow-y-auto relative">
								{children}
								<TaskOverlay />
							</main>
						</div>
						<InteropPanel />
					</div>
				</InternalRecoderStudioClientProvider>
			</ToastProvider>
		</SentryUserWrapper>
	);
}
