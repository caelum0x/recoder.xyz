import { eq } from "drizzle-orm";
import { db, invoices } from "@/db";
import { logger } from "@/lib/logger";
import {
	handleSubscriptionActive,
	handleSubscriptionCanceled,
} from "./handle-subscription";

/**
 * Verify Polar webhook signature using Standard Webhooks spec.
 *
 * Polar signs webhooks per the Standard Webhooks specification:
 * https://docs.polar.sh/integrate/webhooks
 */
async function verifyWebhook(body: string, headers: Headers): Promise<boolean> {
	const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
	if (!webhookSecret) return false;

	const webhookId = headers.get("webhook-id");
	const webhookTimestamp = headers.get("webhook-timestamp");
	const webhookSignature = headers.get("webhook-signature");

	if (!webhookId || !webhookTimestamp || !webhookSignature) return false;

	// Standard Webhooks: sign "msg_id.timestamp.body"
	const signedContent = `${webhookId}.${webhookTimestamp}.${body}`;

	// Secret is base64-encoded, may have "whsec_" prefix
	const secretBytes = base64Decode(
		webhookSecret.startsWith("whsec_") ? webhookSecret.slice(6) : webhookSecret,
	);

	const key = await crypto.subtle.importKey(
		"raw",
		secretBytes,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(signedContent),
	);

	const expectedSig = arrayBufferToBase64(signature);

	// Signature header may contain multiple signatures separated by spaces
	const signatures = webhookSignature.split(" ");
	return signatures.some((sig) => {
		const sigValue = sig.startsWith("v1,") ? sig.slice(3) : sig;
		return timingSafeEqual(sigValue, expectedSig);
	});
}

function base64Decode(str: string): Uint8Array {
	const binary = atob(str);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

const relevantEvents = new Set([
	"subscription.active",
	"subscription.canceled",
	"order.paid",
]);

export async function POST(req: Request) {
	const body = await req.text();

	const verified = await verifyWebhook(body, req.headers);
	if (!verified) {
		logger.error("[polar-webhook] Signature verification failed");
		return new Response("Invalid signature", { status: 400 });
	}

	let event: { type: string; data: Record<string, unknown> };
	try {
		event = JSON.parse(body);
	} catch {
		return new Response("Invalid JSON", { status: 400 });
	}

	logger.info({ eventType: event.type }, "[polar-webhook] Received");

	if (!relevantEvents.has(event.type)) {
		return new Response(`Unsupported event type: ${event.type}`, {
			status: 200,
		});
	}

	try {
		switch (event.type) {
			case "subscription.active": {
				await handleSubscriptionActive(
					event.data as unknown as Parameters<
						typeof handleSubscriptionActive
					>[0],
				);
				return new Response(JSON.stringify({ received: true }));
			}
			case "subscription.canceled": {
				await handleSubscriptionCanceled(
					event.data as unknown as Parameters<
						typeof handleSubscriptionCanceled
					>[0],
				);
				return new Response(JSON.stringify({ received: true }));
			}
			case "order.paid": {
				const order = event.data as {
					id: string;
					metadata?: Record<string, string>;
				};
				const invoiceId = order.metadata?.invoiceId;
				if (invoiceId) {
					await db
						.update(invoices)
						.set({
							status: "paid",
							paidAt: new Date(),
							lastError: null,
							nextRetryAt: null,
						})
						.where(eq(invoices.id, invoiceId));
				}
				return new Response(JSON.stringify({ received: true }));
			}
			default:
				return new Response("Unhandled event", { status: 200 });
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		logger.error({ message }, "[polar-webhook] Handler failed");
		return new Response("Webhook handler failed", { status: 400 });
	}
}
