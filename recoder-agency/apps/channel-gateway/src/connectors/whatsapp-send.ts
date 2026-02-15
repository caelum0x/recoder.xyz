import { env } from "../env.js";
import { logger } from "../logger.js";

type WhatsAppSendParams = {
	to: string;
	text: string;
};

export const sendWhatsAppMessage = async (
	params: WhatsAppSendParams,
): Promise<void> => {
	if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
		throw new Error(
			"WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured.",
		);
	}

	const maxAttempts = 3;
	let attempt = 0;

	// Strip leading '+' for Meta Cloud API
	const recipientPhone = params.to.replace(/^\+/, "");

	while (attempt < maxAttempts) {
		attempt += 1;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10_000);
		let response: Response;
		try {
			response = await fetch(
				`https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
				{
					method: "POST",
					headers: {
						authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({
						messaging_product: "whatsapp",
						to: recipientPhone,
						type: "text",
						text: { body: params.text },
					}),
					signal: controller.signal,
				},
			);
		} finally {
			clearTimeout(timeout);
		}

		if (response.ok) return;

		const payload = (await response.json().catch(() => null)) as {
			error?: { message?: string; code?: number };
		} | null;

		const isRateLimited = response.status === 429;
		const isServerError = response.status >= 500;
		const shouldRetry =
			attempt < maxAttempts && (isRateLimited || isServerError);

		if (!shouldRetry) {
			const errorMsg = payload?.error?.message ?? `HTTP ${response.status}`;
			throw new Error(`WhatsApp API error: ${errorMsg}`);
		}

		const delayMs = isRateLimited
			? attempt * 1000 + Math.random() * 1000
			: attempt * 500 + Math.random() * 1000;
		logger.warn({ attempt, status: response.status }, "WhatsApp send retrying");
		await new Promise((resolve) => setTimeout(resolve, delayMs));
	}
};
