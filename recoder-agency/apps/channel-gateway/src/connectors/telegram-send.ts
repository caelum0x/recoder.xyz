import { env } from "../env.js";
import { logger } from "../logger.js";

type TelegramSendParams = {
	chatId: string;
	text: string;
	replyToMessageId?: string;
};

export const sendTelegramMessage = async (
	params: TelegramSendParams,
): Promise<void> => {
	if (!env.TELEGRAM_BOT_TOKEN) {
		throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
	}

	const maxAttempts = 3;
	let attempt = 0;

	while (attempt < maxAttempts) {
		attempt += 1;
		const body: Record<string, unknown> = {
			chat_id: params.chatId,
			text: params.text,
			parse_mode: "Markdown",
		};
		if (params.replyToMessageId) {
			body.reply_to_message_id = Number(params.replyToMessageId);
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10_000);
		let response: Response;
		try {
			response = await fetch(
				`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body),
					signal: controller.signal,
				},
			);
		} finally {
			clearTimeout(timeout);
		}

		const payload = (await response.json().catch(() => null)) as {
			ok?: boolean;
			description?: string;
			parameters?: { retry_after?: number };
		} | null;

		if (payload?.ok) return;

		const retryAfter = payload?.parameters?.retry_after ?? 0;
		const isRateLimited = response.status === 429 || retryAfter > 0;
		const isServerError = response.status >= 500;
		const shouldRetry =
			attempt < maxAttempts && (isRateLimited || isServerError);

		if (!shouldRetry) {
			const errorMsg = payload?.description ?? `HTTP ${response.status}`;
			throw new Error(`Telegram API error: ${errorMsg}`);
		}

		const delayMs =
			retryAfter > 0 ? retryAfter * 1000 : attempt * 500 + Math.random() * 1000;
		logger.warn({ attempt, status: response.status }, "Telegram send retrying");
		await new Promise((resolve) => setTimeout(resolve, delayMs));
	}
};
