import { and, eq } from "drizzle-orm";
import { authAccounts, db } from "@/db";
import { getCurrentUser } from "@/lib/get-current-user";
import {
	connectIdentity,
	type OAuthProvider,
	reconnectIdentity,
} from "@/services/accounts";

function isValidOAuthProvider(provider: string): provider is OAuthProvider {
	return provider === "github" || provider === "google";
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ provider: string }> },
) {
	const { provider: providerParam } = await params;

	// Validate provider parameter
	if (!isValidOAuthProvider(providerParam)) {
		return new Response(`Invalid provider: ${providerParam}`, { status: 400 });
	}
	const provider: OAuthProvider = providerParam;

	const user = await getCurrentUser();

	// Check if already linked via authAccounts
	const existing = await db
		.select({ id: authAccounts.id })
		.from(authAccounts)
		.where(
			and(
				eq(authAccounts.userId, user.id),
				eq(authAccounts.providerId, provider),
			),
		)
		.limit(1);

	const isAlreadyLinked = existing.length > 0;

	if (isAlreadyLinked) {
		await reconnectIdentity(provider, "/connected");
	} else {
		await connectIdentity(provider, "/connected");
	}
}
