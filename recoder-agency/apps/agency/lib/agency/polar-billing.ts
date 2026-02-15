import crypto from "node:crypto";
import { Polar } from "@polar-sh/sdk";
import { notifyClient } from "@/lib/agency/channel-notifier";

let _polar: Polar | undefined;

function getPolar(): Polar {
	if (!_polar) {
		const accessToken = process.env.POLAR_ACCESS_TOKEN;
		if (!accessToken) throw new Error("POLAR_ACCESS_TOKEN is not configured.");

		_polar = new Polar({
			accessToken,
			server:
				(process.env.POLAR_SERVER as "production" | "sandbox") ?? "production",
		});
	}
	return _polar;
}

/**
 * Create a Polar.sh checkout session for a project invoice.
 * Returns the checkout URL to send to the client.
 */
export async function createInvoiceCheckout(params: {
	clientDbId: number;
	clientEmail: string;
	clientName: string;
	projectId: string;
	projectName: string;
	amountCents: number;
}): Promise<{ checkoutUrl: string } | null> {
	const productId = process.env.POLAR_PRO_PRODUCT_ID;
	if (!productId) {
		console.error("POLAR_PRO_PRODUCT_ID not configured");
		return null;
	}

	try {
		const polar = getPolar();

		const checkout = await polar.checkouts.create({
			products: [productId],
			amount: params.amountCents,
			customerEmail: params.clientEmail,
			customerName: params.clientName,
			metadata: {
				projectId: params.projectId,
				projectName: params.projectName,
				clientDbId: String(params.clientDbId),
			},
			successUrl: process.env.NEXT_PUBLIC_APP_URL
				? `${process.env.NEXT_PUBLIC_APP_URL}/portal/projects/${params.projectId}?payment=success`
				: undefined,
		});

		const checkoutUrl = checkout.url;

		// Notify client via channels
		const priceFormatted = `$${(params.amountCents / 100).toFixed(2)}`;
		await notifyClient(
			params.clientDbId,
			[
				`Invoice ready for ${params.projectName}: ${priceFormatted}`,
				"",
				`Pay here: ${checkoutUrl}`,
			].join("\n"),
		);

		return { checkoutUrl };
	} catch (error) {
		console.error("Polar checkout creation failed:", error);
		return null;
	}
}

/**
 * Verify a Polar webhook signature.
 */
export function verifyPolarWebhook(params: {
	rawBody: string;
	signature: string;
}): boolean {
	const secret = process.env.POLAR_WEBHOOK_SECRET;
	if (!secret) return false;

	try {
		const digestBuf = crypto
			.createHmac("sha256", secret)
			.update(params.rawBody)
			.digest();
		const signatureBuf = Buffer.from(params.signature, "hex");
		if (digestBuf.length !== signatureBuf.length) return false;
		return crypto.timingSafeEqual(digestBuf, signatureBuf);
	} catch {
		return false;
	}
}
