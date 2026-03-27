import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/core";

/**
 * Generates the GitHub App installation URL.
 *
 * This function authenticates as a GitHub App, retrieves the app information,
 * and constructs the URL for installing the app on a GitHub account.
 *
 * @returns {Promise<string>} The URL for installing the GitHub App.
 * @throws {Error} If the request to get app information fails.
 */
export async function gitHubAppInstallURL(): Promise<string | undefined> {
	const auth = appAuth();
	if (!auth) return undefined;
	const app = await auth({ type: "app" });
	const octokit = new Octokit({ auth: app.token });
	try {
		const res = await octokit.request("GET /app");
		if (res.status !== 200 || !res.data) {
			throw new Error("Failed to get app information");
		}
		return `https://github.com/apps/${res.data.slug}/installations/new`;
	} catch (error: unknown) {
		console.error("Error getting GitHub App information:", error);
		return;
	}
}

/**
 * Builds an authenticated GitHub client for a specific app installation.
 *
 * Authenticating as a GitHub App installation: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
 *
 * @param installationId - The ID of the GitHub app installation.
 * @returns A promise that resolves to an authenticated Octokit instance.
 */
export async function buildAppInstallationClient(installationId: number) {
	const auth = appAuth();
	if (!auth) {
		throw new Error("GitHub App credentials are not configured. Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_CLIENT_ID, and GITHUB_APP_CLIENT_SECRET.");
	}
	const installationAuth = await auth({
		type: "installation",
		installationId,
	});

	return new Octokit({
		auth: installationAuth.token,
	});
}

function isPlaceholder(val: string | undefined): boolean {
	if (!val) return true;
	const trimmed = val.replace(/^["']|["']$/g, "");
	return !trimmed || trimmed === "placeholder" || trimmed.length < 4;
}

/** Strip surrounding double or single quotes that bash `export "$line"` may keep. */
function stripQuotes(val: string): string {
	if (
		(val.startsWith('"') && val.endsWith('"')) ||
		(val.startsWith("'") && val.endsWith("'"))
	) {
		return val.slice(1, -1);
	}
	return val;
}

function resolvePrivateKey(): string | null {
	// Try direct PEM key first
	let raw = process.env.GITHUB_APP_PRIVATE_KEY;
	if (raw) {
		raw = stripQuotes(raw);
	}
	if (raw && raw.includes("-----BEGIN")) {
		// Handle escaped newlines from env files
		return raw.replace(/\\n/g, "\n");
	}

	// Fall back to base64-encoded key
	let b64 = process.env.GITHUB_APP_PRIVATE_KEY_BASE64;
	if (b64) {
		b64 = stripQuotes(b64);
	}
	if (b64 && b64.length > 100) {
		try {
			return Buffer.from(b64, "base64").toString("utf-8");
		} catch {
			return null;
		}
	}

	return null;
}

function appAuth() {
	const appId = process.env.GITHUB_APP_ID;
	const clientId = process.env.GITHUB_APP_CLIENT_ID;
	const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;

	if (isPlaceholder(appId) || isPlaceholder(clientId) || isPlaceholder(clientSecret)) {
		return null;
	}

	const privateKey = resolvePrivateKey();
	if (!privateKey) {
		return null;
	}

	return createAppAuth({
		appId: appId!,
		privateKey,
		clientId: clientId!,
		clientSecret: clientSecret!,
	});
}
