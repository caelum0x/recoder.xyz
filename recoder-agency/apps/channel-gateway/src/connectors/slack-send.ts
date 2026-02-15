import { env } from "../env.js";

type SlackPostMessageParams = {
	channel: string;
	text: string;
	thread_ts?: string;
	blocks?: Array<Record<string, unknown>>;
};

export const sendSlackMessage = async (params: SlackPostMessageParams) => {
	if (!env.SLACK_BOT_TOKEN) {
		throw new Error("SLACK_BOT_TOKEN is not configured.");
	}

	const maxAttempts = 3;
	let attempt = 0;

	while (attempt < maxAttempts) {
		attempt += 1;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10_000);
		let response: Response;
		try {
			response = await fetch("https://slack.com/api/chat.postMessage", {
				method: "POST",
				headers: {
					authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
					"content-type": "application/json; charset=utf-8",
				},
				body: JSON.stringify({
					channel: params.channel,
					text: params.text,
					thread_ts: params.thread_ts,
					blocks: params.blocks,
				}),
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timeout);
		}

		const payload = (await response.json()) as {
			ok?: boolean;
			error?: string;
		};
		if (payload.ok) return;

		const retryAfter = Number(response.headers.get("retry-after") ?? "0");
		const isRateLimited =
			response.status === 429 || payload.error === "ratelimited";
		const isServerError = response.status >= 500;
		const shouldRetry =
			attempt < maxAttempts && (isRateLimited || isServerError);

		if (!shouldRetry) {
			throw new Error(`Slack API error: ${payload.error ?? "unknown"}`);
		}

		const delayMs =
			retryAfter > 0 ? retryAfter * 1000 : attempt * 500 + Math.random() * 1000;
		await new Promise((resolve) => setTimeout(resolve, delayMs));
	}
};
