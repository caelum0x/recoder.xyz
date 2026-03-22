import { type GitHubAuthConfig, octokit } from "@recoder/github-tool";

function isValidGitHubPrivateKey(key: string | undefined): key is string {
	return !!key && (key.includes("-----BEGIN") || key.includes("\\n"));
}

/**
 * Build GitHub App Octokit client with installation authentication.
 * Returns null if GitHub App credentials are not properly configured.
 */
export function buildOctokit(installationId: number) {
	const appId = process.env.GITHUB_APP_ID;
	const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

	if (!appId || appId === "placeholder" || !isValidGitHubPrivateKey(privateKey)) {
		return null;
	}

	return octokit({
		strategy: "app-installation",
		appId,
		privateKey,
		installationId,
	});
}

/**
 * Build GitHub auth config for loaders.
 * Returns null if GitHub App credentials are not properly configured.
 */
export function buildGitHubAuthConfig(
	installationId: number,
): GitHubAuthConfig | null {
	const appId = process.env.GITHUB_APP_ID;
	const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

	if (!appId || appId === "placeholder" || !isValidGitHubPrivateKey(privateKey)) {
		return null;
	}

	return {
		strategy: "app-installation",
		appId,
		privateKey,
		installationId,
	};
}
