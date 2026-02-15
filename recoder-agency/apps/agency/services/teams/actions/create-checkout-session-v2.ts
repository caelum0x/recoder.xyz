import invariant from "tiny-invariant";
import { logger } from "@/lib/logger";
import { polar } from "@/services/external/polar";

export async function createCheckoutSessionV2(
	subscriptionMetadata: Record<string, string>,
	successUrl: string,
	_cancelUrl: string,
) {
	const productId = process.env.POLAR_PRO_PRODUCT_ID;
	invariant(productId, "POLAR_PRO_PRODUCT_ID is not set");

	logger.debug(
		{ productId, subscriptionMetadata },
		"[polar-checkout] Creating checkout session",
	);

	try {
		const checkout = await polar.checkouts.create({
			products: [productId],
			successUrl,
			metadata: subscriptionMetadata,
		});

		if (checkout.url == null) {
			throw new Error("checkout.url is null");
		}

		logger.debug(
			{ checkoutId: checkout.id },
			"[polar-checkout] Checkout session created",
		);

		return { id: checkout.id, url: checkout.url };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		const errorName = error instanceof Error ? error.name : "UnknownError";
		logger.error({ errorName, message }, "[polar-checkout] Error");
		logger.debug({ error }, "[polar-checkout] Error details");
		throw new Error("Failed to create checkout session");
	}
}
