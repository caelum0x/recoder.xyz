import { captureException } from "@sentry/nextjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, teams } from "@/db";
import { getGiselleSession, updateGiselleSession } from "@/lib/giselle-session";
import { polar } from "@/services/external/polar";

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const checkoutId = searchParams.get("checkout_id");

	// Also check session-based checkout ID for backwards compat
	const session = await getGiselleSession();
	const sessionCheckoutId = session?.checkoutSessionId;
	const resolvedCheckoutId = checkoutId ?? sessionCheckoutId;

	if (resolvedCheckoutId == null) {
		redirect("/settings/team");
	}

	try {
		const checkout = await polar.checkouts.get({ id: resolvedCheckoutId });

		const subscriptionId = checkout.subscriptionId;
		if (!subscriptionId) {
			throw new Error("Subscription ID not found in checkout");
		}

		const teamDbIdStr = checkout.metadata?.teamDbId as string | undefined;
		if (teamDbIdStr) {
			const teamDbId = Number.parseInt(teamDbIdStr, 10);
			const [team] = await db
				.select({ teamId: teams.id })
				.from(teams)
				.where(eq(teams.dbId, teamDbId));
			if (team) {
				await updateGiselleSession({
					teamId: team.teamId,
					checkoutSessionId: undefined,
				});
			}
		}
	} catch (error) {
		captureException(error);
	}

	redirect("/settings/team");
}
