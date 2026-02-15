"use server";

import { redirect } from "next/navigation";
import invariant from "tiny-invariant";

/**
 * Opens the Polar customer portal for subscription management.
 */
export async function manageBilling(subscriptionId: string) {
	const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
	invariant(siteUrl, "NEXT_PUBLIC_SITE_URL is not set");

	const organizationId = process.env.POLAR_ORGANIZATION_ID;
	invariant(organizationId, "POLAR_ORGANIZATION_ID is not set");

	// Redirect to Polar's hosted customer portal
	redirect(
		`https://polar.sh/${organizationId}/portal?subscription_id=${subscriptionId}`,
	);
}
