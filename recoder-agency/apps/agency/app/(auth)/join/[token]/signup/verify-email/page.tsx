import { notFound, redirect } from "next/navigation";
import { fetchInvitationToken } from "../../invitation";
import { JoinVerifyForm } from "./form";

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
		<div className="min-h-screen flex flex-col items-center justify-center">
			<div className="w-[320px] space-y-8">
				<div className="text-center">
					<h2
						className="mt-6 text-[28px] font-[500] text-accent font-sans text-center"
						style={{ textShadow: "0px 0px 20px #0087F6" }}
					>
						Verify your email
					</h2>
					<p className="mt-4 text-[14px] font-sans text-primary-300">
						We've sent a confirmation code to your email. Please enter it below
						to complete your registration.
					</p>
				</div>
				<JoinVerifyForm
					invitedEmail={tokenObj.invitedEmail}
					invitationToken={token}
				/>
			</div>
		</div>
	);
}
