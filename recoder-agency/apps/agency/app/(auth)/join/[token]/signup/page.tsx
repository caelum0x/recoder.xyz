import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClickableText } from "@/components/ui/clickable-text";
import { ActionPrompt } from "../../../components/action-prompt";
import { AuthContainer } from "../../../components/auth-container";
import { LegalConsent } from "../../../components/legal-consent";
import { declineInvitation } from "../actions";
import { fetchInvitationToken } from "../invitation";
import { SignupForm } from "./form";

export default async function Page({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;

	const tokenObj = await fetchInvitationToken(token);
	if (!tokenObj) {
		return notFound();
	}
	if (tokenObj.expiredAt < new Date()) {
		redirect(`/join/${encodeURIComponent(token)}`);
	}

	return (
		<AuthContainer title="You have been invited">
			<div className="text-center mb-8">
				<h2 className="text-[24px] font-[600] text-orange-500 font-sans mb-2">
					<span aria-hidden className="text-text/60 select-none mr-1">
						“
					</span>
					{tokenObj.teamName}
					<span aria-hidden className="text-text/60 select-none ml-1">
						”
					</span>
				</h2>
				<p className="text-[14px] font-sans text-muted">
					Create your account to join this team
				</p>
			</div>

			<div className="auth-form-section">
				<SignupForm email={tokenObj.invitedEmail} token={token} />
			</div>

			<div className="auth-action-section">
				<ActionPrompt
					prompt="Already have a Recoder Agency account?"
					action={
						<ClickableText asChild>
							<Link href={`/join/${token}/login`}>Log in</Link>
						</ClickableText>
					}
				/>
			</div>

			<div className="auth-legal-section">
				<LegalConsent />
			</div>

			<div className="auth-action-section">
				<div className="flex justify-center">
					<form action={declineInvitation} className="contents">
						<input type="hidden" name="token" value={token} />
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
