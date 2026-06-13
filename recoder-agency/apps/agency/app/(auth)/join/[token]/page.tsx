import { notFound, redirect } from "next/navigation";
import { getSessionUserOrNull } from "@/lib/auth/server";
import { AuthContainer } from "../../components";
import { AuthButton } from "../../components/auth-button";
import { LegalConsent } from "../../components/legal-consent";
import { declineInvitation, joinTeam } from "./actions";
import { ExpiredError, WrongEmailError } from "./error-components";
import { fetchInvitationToken } from "./invitation";

export default async function Page({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token: tokenParam } = await params;

	const token = await fetchInvitationToken(tokenParam);
	if (!token) {
		return notFound();
	}
	if (token.expiredAt < new Date()) {
		return <ExpiredError />;
	}

	const user = await getSessionUserOrNull();
	if (!user) {
		// redirect to signup page
		redirect(`/join/${encodeURIComponent(tokenParam)}/signup`);
	}

	if (user.email !== token.invitedEmail) {
		return <WrongEmailError teamName={token.teamName} token={tokenParam} />;
	}

	return (
		<AuthContainer title="You have been invited">
			<div className="text-center mb-8">
				<h2 className="text-[24px] font-[600] text-orange-500 font-sans mb-2">
					<span aria-hidden className="text-text/60 select-none mr-1">
						"
					</span>
					{token.teamName}
					<span aria-hidden className="text-text/60 select-none ml-1">
						"
					</span>
				</h2>
				<p className="text-[14px] font-sans text-muted">
					You have been invited to join this team
				</p>
			</div>

			<div className="auth-form-section">
				<form action={joinTeam} className="contents">
					<input type="hidden" name="token" value={tokenParam} />
					<AuthButton type="submit">Join to team</AuthButton>
				</form>
			</div>

			<div className="auth-legal-section">
				<LegalConsent />
			</div>

			<div className="auth-action-section">
				<div className="flex justify-center">
					<form action={declineInvitation} className="contents">
						<input type="hidden" name="token" value={tokenParam} />
						<button
							type="submit"
							className="text-text hover:text-text/80 underline"
						>
							Decline
						</button>
					</form>
				</div>
			</div>
		</AuthContainer>
	);
}
