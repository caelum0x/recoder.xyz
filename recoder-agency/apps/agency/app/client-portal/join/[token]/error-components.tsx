import Link from "next/link";
import { AuthContainer } from "@/app/(auth)/components";
import { AuthButton } from "@/app/(auth)/components/auth-button";
import { signoutAndRetry } from "./actions";

export function ExpiredError() {
	return (
		<AuthContainer title="Invitation Expired">
			<div className="text-center space-y-4">
				<p className="text-[14px] font-sans text-muted">
					This invitation has expired. Please contact the agency to request a
					new invitation.
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

export function AlreadyAcceptedError() {
	return (
		<AuthContainer title="Already Accepted">
			<div className="text-center space-y-4">
				<p className="text-[14px] font-sans text-muted">
					This invitation has already been accepted. You can access your client
					portal now.
				</p>
				<Link
					href="/portal"
					className="inline-flex items-center justify-center w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
				>
					Go to Portal
				</Link>
			</div>
		</AuthContainer>
	);
}

interface WrongEmailErrorProps {
	agencyName: string;
	expectedEmail: string;
	token: string;
}

export function WrongEmailError({
	agencyName,
	expectedEmail,
	token,
}: WrongEmailErrorProps) {
	return (
		<AuthContainer title="Wrong Account">
			<div className="text-center space-y-4">
				<p className="text-[14px] font-sans text-muted">
					This invitation was sent to{" "}
					<strong className="text-text">{expectedEmail}</strong> for{" "}
					<strong className="text-text">{agencyName}</strong>.
				</p>
				<p className="text-[14px] font-sans text-muted">
					Please sign in with the correct account to accept this invitation.
				</p>
				<form action={signoutAndRetry} className="contents">
					<input type="hidden" name="token" value={token} />
					<AuthButton type="submit">Sign in with different account</AuthButton>
				</form>
			</div>
		</AuthContainer>
	);
}
