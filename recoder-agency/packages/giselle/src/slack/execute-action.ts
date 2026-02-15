/**
 * Slack action executor — sends messages via Slack Web API.
 */

export interface SlackSendMessageParams {
	botToken: string;
	channelId: string;
	text: string;
}

export interface SlackSendReplyParams {
	botToken: string;
	channelId: string;
	text: string;
	threadTs: string;
}

const SLACK_API_BASE = "https://slack.com/api";

export async function sendSlackMessage(
	params: SlackSendMessageParams,
): Promise<{ ts: string; channelId: string }> {
	const { botToken, channelId, text } = params;

	const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${botToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			channel: channelId,
			text,
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Slack API error: ${response.status} ${error}`);
	}

	const result = (await response.json()) as {
		ok: boolean;
		error?: string;
		ts: string;
		channel: string;
	};

	if (!result.ok) {
		throw new Error(`Slack API error: ${result.error}`);
	}

	return { ts: result.ts, channelId: result.channel };
}

export async function sendSlackReply(
	params: SlackSendReplyParams,
): Promise<{ ts: string; channelId: string }> {
	const { botToken, channelId, text, threadTs } = params;

	const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${botToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			channel: channelId,
			text,
			thread_ts: threadTs,
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Slack API error: ${response.status} ${error}`);
	}

	const result = (await response.json()) as {
		ok: boolean;
		error?: string;
		ts: string;
		channel: string;
	};

	if (!result.ok) {
		throw new Error(`Slack API error: ${result.error}`);
	}

	return { ts: result.ts, channelId: result.channel };
}
