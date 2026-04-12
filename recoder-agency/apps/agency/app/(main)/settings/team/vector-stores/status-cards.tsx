import { AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
	connectGitHubIdentity,
	reconnectGitHubIdentity,
} from "../../account/actions";
import { Button } from "../../components/button";

export function GitHubAuthRequiredCard({
	invalidCredential = false,
}: {
	invalidCredential?: boolean;
}) {
	return (
		<Card className="rounded-[8px] bg-transparent p-6 border-0">
			<div className="flex flex-col items-center justify-center py-8">
				<h4 className="text-text font-medium text-[18px] leading-[21.6px] font-sans mb-2">
					GitHub Vector Stores
				</h4>
				<p className="text-link-muted text-[14px] leading-[20.4px] font-sans text-center mb-4">
					Vector Stores index GitHub repositories for use as knowledge sources in
					your workflows. Connect your GitHub account first, then install the
					GitHub App on the repositories you want to use.
				</p>
				<form
					action={invalidCredential ? reconnectGitHubIdentity : connectGitHubIdentity}
				>
					<Button variant="primary" type="submit">
						{invalidCredential ? "Reconnect GitHub" : "Connect GitHub"}
					</Button>
				</form>
			</div>
		</Card>
	);
}

export function GitHubAuthErrorCard({
	errorMessage,
}: {
	errorMessage: string;
}) {
	return (
		<Card className="rounded-[8px] bg-transparent p-6 border-0">
			<div className="flex flex-col items-center justify-center py-8">
				<div className="flex items-center gap-2 mb-4">
					<AlertCircle className="text-error-900" size={24} />
					<h4 className="text-error-900 font-medium text-[18px] leading-[21.6px] font-sans">
						GitHub authentication error occurred.
					</h4>
				</div>
				<p className="text-error-900/70 text-[14px] leading-[20.4px] font-sans text-center mb-4">
					{errorMessage}
				</p>
			</div>
		</Card>
	);
}

export function GitHubAppInstallRequiredCard() {
	return (
		<Card className="rounded-[8px] bg-transparent p-6 border-0">
			<div className="flex flex-col items-center justify-center py-8">
				<h4 className="text-text font-medium text-[18px] leading-[21.6px] font-sans mb-2">
					Please install the GitHub App.
				</h4>
				<p className="text-link-muted text-[14px] leading-[20.4px] font-sans text-center mb-4">
					To use Vector Stores, you need to install the GitHub App. Please
					install from your integrations settings page.
				</p>
				<Button asChild variant="primary">
					<a href="/settings/team/integrations">Open Integrations Settings</a>
				</Button>
			</div>
		</Card>
	);
}
