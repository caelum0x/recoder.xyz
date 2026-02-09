import { eq } from "drizzle-orm";
import { authAccounts, db } from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";
import {
	buildGoogleUserClient,
	type GoogleUserClient,
	type GoogleUserData,
	needsAuthorization,
} from "../external/google";
import { getOauthCredential } from "./oauth-credentials";

type GoogleIdentityState =
	| GoogleIdentityStateUnauthorized
	| GoogleIdentityStateInvalidCredential
	| GoogleIdentityStateAuthorized;

type GoogleIdentityStateUnauthorized = {
	status: "unauthorized";
};

type GoogleIdentityStateInvalidCredential = {
	status: "invalid-credential";
};

type GoogleIdentityStateAuthorized = {
	status: "authorized";
	googleUser: GoogleUserData;
	googleUserClient: GoogleUserClient;
	unlinkable: boolean;
};

export async function getGoogleIdentityState(): Promise<GoogleIdentityState> {
	const credential = await getOauthCredential("google");
	if (!credential) {
		return { status: "unauthorized" };
	}

	const googleUserClient = buildGoogleUserClient(credential);
	try {
		const googleUser = await googleUserClient.getUser();
		const user = await getCurrentUser();

		// Check if user has more than one auth account (i.e., can unlink)
		const accounts = await db
			.select({ id: authAccounts.id })
			.from(authAccounts)
			.where(eq(authAccounts.userId, user.id));
		const unlinkable = accounts.length > 1;

		return { status: "authorized", googleUser, googleUserClient, unlinkable };
	} catch (error) {
		if (needsAuthorization(error)) {
			return { status: "invalid-credential" };
		}
		throw error;
	}
}
