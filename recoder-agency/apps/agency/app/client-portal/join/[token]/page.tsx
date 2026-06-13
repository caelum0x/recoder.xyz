import { notFound, redirect } from "next/navigation";
import { AuthContainer } from "@/app/(auth)/components";
import { AuthButton } from "@/app/(auth)/components/auth-button";
import { LegalConsent } from "@/app/(auth)/components/legal-consent";
import { fetchClientInvitation } from "@/lib/agency/client-invitation";
import { getSessionUserOrNull } from "@/lib/auth/server";
import { acceptPortalInvitation } from "./actions";
import {
	AlreadyAcceptedError,
	ExpiredError,
	WrongEmailError,
} from "./error-components";

export default async function ClientPortalJoinPage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token: tokenParam } = await params;

	const invitation = await fetchClientInvitation(tokenParam);
	if (!invitation) {
		return notFound();
	}

	// Check if already accepted
	if (invitation.acceptedAt) {
		return <AlreadyAcceptedError />;
	}

	// Check if revoked
	if (invitation.revokedAt) {
		return notFound();
	}

	// Check if expired
	if (invitation.expiredAt < new Date()) {
		return <ExpiredError />;
	}

	const user = await getSessionUserOrNull();
	if (!user) {
		// User is not logged in, redirect to signup with return URL
		redirect(
			`/signup?returnUrl=${encodeURIComponent(`/client-portal/join/${tokenParam}`)}`,
		);
	}

	// Check if the logged in user's email matches the invitation
	if (user.email !== invitation.clientEmail) {
		return (
			<WrongEmailError
				agencyName={invitation.teamName}
				expectedEmail={invitation.clientEmail ?? ""}
				token={tokenParam}
			/>
		);
	}

	return (
		<AuthContainer title="Welcome to Your Client Portal">
			<div className="text-center mb-8">
				<h2 className="text-[24px] font-[600] text-orange-500 font-sans mb-2">
					<span aria-hidden className="text-text/60 select-none mr-1">
						"
					</span>
					{invitation.teamName}
					<span aria-hidden className="text-text/60 select-none ml-1">
						"
					</span>
				</h2>
				<p className="text-[14px] font-sans text-muted">
					{invitation.teamName} has invited you to access your client portal
				</p>
			</div>

			<div className="auth-form-section">
				<form action={acceptPortalInvitation} className="contents">
					<input type="hidden" name="token" value={tokenParam} />
					<AuthButton type="submit">Access Portal</AuthButton>
				</form>
			</div>

			<div className="auth-legal-section">
				<LegalConsent />
			</div>
		</AuthContainer>
	);
}
