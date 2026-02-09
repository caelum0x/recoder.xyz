import { CheckCircleIcon } from "lucide-react";
import Link from "next/link";
import { AuthContainer } from "@/app/(auth)/components";

export default function ClientPortalJoinSuccessPage() {
	return (
		<AuthContainer title="Welcome to Your Portal!">
			<div className="text-center space-y-6">
				<div className="flex justify-center">
					<div className="flex items-center justify-center size-16 rounded-full bg-green-500/10">
						<CheckCircleIcon className="size-8 text-green-400" />
					</div>
				</div>

				<div className="space-y-2">
					<p className="text-[14px] font-sans text-muted">
						Your client portal access has been activated successfully.
					</p>
					<p className="text-[14px] font-sans text-muted">
						You can now view your projects, submit briefs, and review
						deliverables.
					</p>
				</div>

				<Link
					href="/portal"
					className="inline-flex items-center justify-center w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
				>
					Go to Your Portal
				</Link>
			</div>
		</AuthContainer>
	);
}
