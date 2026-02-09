import type { components } from "@octokit/openapi-types";
import { eq } from "drizzle-orm";
import { authAccounts, db } from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";
import {
	buildGitHubUserClient,
	type GitHubUserClient,
	needsAuthorization,
} from "../external/github";
import { getOauthCredential } from "./oauth-credentials";

type GitHubIdentityState =
	| GitHubIdentityStateUnauthorized
	| GitHubIdentityStateInvalidCredential
	| GitHubIdentityStateAuthorized
	| GitHubIdentityStateError;

type GitHubIdentityStateUnauthorized = {
	status: "unauthorized";
};
type GitHubIdentityStateInvalidCredential = {
	status: "invalid-credential";
};

type GitHubIdentityStateAuthorized = {
	status: "authorized";
	gitHubUser: components["schemas"]["simple-user"];
	gitHubUserClient: GitHubUserClient;
	unlinkable: boolean;
};

type GitHubIdentityStateError = {
	status: "error";
	errorMessage: string;
};

export async function getGitHubIdentityState(): Promise<GitHubIdentityState> {
	const credential = await getOauthCredential("github");
	if (!credential) {
		return { status: "unauthorized" };
	}

	const gitHubUserClient = buildGitHubUserClient(credential);
	try {
		const gitHubUser = await gitHubUserClient.getUser();
		const user = await getCurrentUser();

		// Check if user has more than one auth account (i.e., can unlink)
		const accounts = await db
			.select({ id: authAccounts.id })
			.from(authAccounts)
			.where(eq(authAccounts.userId, user.id));
		const unlinkable = accounts.length > 1;

		return { status: "authorized", gitHubUser, gitHubUserClient, unlinkable };
	} catch (error: unknown) {
		if (needsAuthorization(error)) {
			return { status: "invalid-credential" };
		}

		console.error("Error getting GitHub identity state:", error);
		return {
			status: "error",
			errorMessage: "The GitHub API returned an error. Please try again later.",
		};
	}
}
