/**
 * WhatsApp action executor — sends messages via WhatsApp Cloud API.
 */

export interface WhatsAppSendMessageParams {
	phoneNumberId: string;
	accessToken: string;
	to: string;
	body: string;
}

export interface WhatsAppSendMediaParams {
	phoneNumberId: string;
	accessToken: string;
	to: string;
	mediaUrl: string;
	caption?: string;
}

const WHATSAPP_API_BASE = "https://graph.facebook.com/v21.0";

export async function sendWhatsAppMessage(
	params: WhatsAppSendMessageParams,
): Promise<{ messageId: string }> {
	const { phoneNumberId, accessToken, to, body } = params;

	const response = await fetch(
		`${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				messaging_product: "whatsapp",
				to,
				type: "text",
				text: { body },
			}),
		},
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`WhatsApp API error: ${response.status} ${error}`);
	}

	const result = (await response.json()) as {
		messages: Array<{ id: string }>;
	};
	return { messageId: result.messages[0].id };
}

export async function sendWhatsAppMedia(
	params: WhatsAppSendMediaParams,
): Promise<{ messageId: string }> {
	const { phoneNumberId, accessToken, to, mediaUrl, caption } = params;

	const response = await fetch(
		`${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				messaging_product: "whatsapp",
				to,
				type: "image",
				image: { link: mediaUrl, caption },
			}),
		},
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`WhatsApp API error: ${response.status} ${error}`);
	}

	const result = (await response.json()) as {
		messages: Array<{ id: string }>;
	};
	return { messageId: result.messages[0].id };
}
