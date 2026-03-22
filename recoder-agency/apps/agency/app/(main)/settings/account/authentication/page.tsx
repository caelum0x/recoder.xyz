import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { GitHubAuthentication } from "../github-authentication";
import { GoogleAuthentication } from "../google-authentication";

function isPlaceholder(val: string | undefined): boolean {
	return !val || val.includes("placeholder") || val.length < 10;
}

export default async function AccountAuthenticationPage({
	searchParams,
}: {
	searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
	const params = await searchParams;
	const oauthError =
		typeof params?.oauthError === "string" ? params.oauthError : undefined;

	const isGoogleConfigured =
		!isPlaceholder(process.env.GOOGLE_OAUTH_CLIENT_ID) &&
		!isPlaceholder(process.env.GOOGLE_OAUTH_CLIENT_SECRET);

	const isGitHubConfigured =
		!isPlaceholder(process.env.GITHUB_APP_CLIENT_ID) &&
		!isPlaceholder(process.env.GITHUB_APP_CLIENT_SECRET);

	return (
		<div className="flex flex-col gap-[12px]">
			<p className="text-link-muted text-[12px] leading-[20.4px] tracking-normal font-sans">
				Connect your Recoder Agency account with a third-party service to use it
				for login.
			</p>
			{oauthError && (
				<div className="text-error-900 bg-error-900/12 border border-error-900/40 rounded-[12px] p-3 text-[12px] font-sans">
					OAuth Error: {oauthError}
				</div>
			)}
			{!isGoogleConfigured && !isGitHubConfigured && (
				<div className="rounded-[12px] border border-yellow-500/40 bg-yellow-500/10 p-3 text-[12px] font-sans text-inverse/70">
					Third-party authentication is not yet configured for this instance.
					Google OAuth and GitHub App credentials need to be set by an
					administrator.
				</div>
			)}
			<div className="flex flex-col gap-y-4">
				{isGoogleConfigured ? (
					<Suspense
						fallback={
							<Skeleton className="rounded-md border border-border-muted w-full h-16" />
						}
					>
						<GoogleAuthentication />
					</Suspense>
				) : (
					<div className="rounded-md border border-border-muted p-4 flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="size-8 rounded-full bg-white/10 flex items-center justify-center text-inverse/40 text-sm font-bold">
								G
							</div>
							<div>
								<p className="text-[13px] font-medium text-inverse/80">Google</p>
								<p className="text-[11px] text-inverse/40">Not configured</p>
							</div>
						</div>
						<span className="text-[11px] text-inverse/30 px-3 py-1 rounded border border-border-muted">
							Unavailable
						</span>
					</div>
				)}
				{isGitHubConfigured ? (
					<Suspense
						fallback={
							<Skeleton className="rounded-md border border-border-muted w-full h-16" />
						}
					>
						<GitHubAuthentication />
					</Suspense>
				) : (
					<div className="rounded-md border border-border-muted p-4 flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="size-8 rounded-full bg-white/10 flex items-center justify-center text-inverse/40 text-sm font-bold">
								GH
							</div>
							<div>
								<p className="text-[13px] font-medium text-inverse/80">GitHub</p>
								<p className="text-[11px] text-inverse/40">Not configured</p>
							</div>
						</div>
						<span className="text-[11px] text-inverse/30 px-3 py-1 rounded border border-border-muted">
							Unavailable
						</span>
					</div>
				)}
			</div>
		</div>
	);
}
