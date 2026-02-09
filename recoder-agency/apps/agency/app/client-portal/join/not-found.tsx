import Link from "next/link";
import { AuthContainer } from "@/app/(auth)/components";

export default function ClientPortalJoinNotFound() {
	return (
		<AuthContainer title="Invitation Not Found">
			<div className="text-center space-y-4">
				<p className="text-[14px] font-sans text-muted">
					This invitation link is invalid or has been revoked. Please contact
					the agency for assistance.
				</p>
				<Link
					href="/"
					className="inline-block text-primary hover:text-primary/80 underline"
				>
					Go to Homepage
				</Link>
			</div>
		</AuthContainer>
	);
}
