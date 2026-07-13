/**
 * notify-engine — the owned NOTIFY engine (RECODER-ENGINES). It lets a coding
 * agent send a single human-facing notification (e.g. "delivery ready for
 * review") to a configured webhook:
 *
 *   notify({ message, title?, level?, url? })
 *     → resolve webhook (input.url ?? RECODER_NOTIFY_URL ?? SLACK_WEBHOOK_URL)
 *     → POST a Slack-style JSON payload { text }
 *     → truthful result: sent | not_configured | error
 *
 * INJECTABLE BY CONSTRUCTION: `fetch` and `env` are both passed in, so unit tests
 * drive it with fakes and touch no network. The backend wires the global `fetch`
 * and `process.env`.
 *
 * DEGRADE-SAFE (the hard rule): with no resolvable webhook url the engine returns
 * a truthful `status: 'not_configured'` (never throws, never fabricates a send).
 * A non-2xx response or a thrown fetch returns `status: 'error'` with a reason.
 */

export type NotifyLevel = "info" | "warn" | "error";

export interface NotifyInput {
	/** The human-facing message body (required). */
	message: string;
	/** Optional title, prefixed to the message text as `title: message`. */
	title?: string;
	/** Severity hint, echoed to the caller. Defaults to 'info'. */
	level?: NotifyLevel;
	/** Per-call webhook override; takes precedence over env. */
	url?: string;
}

export type NotifyStatus = "sent" | "not_configured" | "error";

export interface NotifyResult {
	status: NotifyStatus;
	level: NotifyLevel;
	/** The webhook host the payload was posted to (never the full secret url). */
	target?: string;
	/** Truthful reason when degraded (not_configured) or failed (error). */
	reason?: string;
}

/** Minimal structural response — satisfied by the global `fetch` Response. */
export interface NotifyHttpResponse {
	ok: boolean;
	status: number;
}

/** Minimal structural fetch — injectable so tests touch no real network. */
export type NotifyFetch = (
	url: string,
	init: { method: string; headers: Record<string, string>; body: string },
) => Promise<NotifyHttpResponse>;

/** Env subset read to resolve the webhook. Both keys optional. */
export interface NotifyEnv {
	RECODER_NOTIFY_URL?: string;
	SLACK_WEBHOOK_URL?: string;
}

export interface NotifyEngine {
	notify(input: NotifyInput): Promise<NotifyResult>;
}

export interface NotifyEngineDeps {
	/** Injectable fetch. `notify` degrades to `error` if it throws. */
	fetch: NotifyFetch;
	/** Env subset consulted for the webhook url (after `input.url`). */
	env?: NotifyEnv;
}

const NOT_CONFIGURED_REASON =
	"notify not configured (no webhook url via input.url, RECODER_NOTIFY_URL, or SLACK_WEBHOOK_URL)";

export function createNotifyEngine(deps: NotifyEngineDeps): NotifyEngine {
	const { fetch: doFetch } = deps;
	const env = deps.env ?? {};

	async function notify(input: NotifyInput): Promise<NotifyResult> {
		const level = normalizeLevel(input.level);
		const url = resolveUrl(input.url, env);

		// No resolvable webhook — refuse truthfully before doing any work.
		if (!url) {
			return { status: "not_configured", level, reason: NOT_CONFIGURED_REASON };
		}

		const target = hostOf(url);
		const message = typeof input.message === "string" ? input.message : "";
		const title = readString(input.title);
		const text = `${title ? `${title}: ` : ""}${message}`;
		const body = JSON.stringify({ text });

		try {
			const res = await doFetch(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body,
			});
			if (res.ok) {
				return { status: "sent", level, target };
			}
			return {
				status: "error",
				level,
				target,
				reason: `webhook responded ${res.status}`,
			};
		} catch (err) {
			return {
				status: "error",
				level,
				target,
				reason: errorMessage(err),
			};
		}
	}

	return { notify };
}

/** input.url ?? RECODER_NOTIFY_URL ?? SLACK_WEBHOOK_URL (first non-empty). */
function resolveUrl(inputUrl: string | undefined, env: NotifyEnv): string | undefined {
	return (
		readString(inputUrl) ??
		readString(env.RECODER_NOTIFY_URL) ??
		readString(env.SLACK_WEBHOOK_URL)
	);
}

function normalizeLevel(level: NotifyLevel | undefined): NotifyLevel {
	return level === "warn" || level === "error" ? level : "info";
}

/** Host of a url for truthful reporting without leaking the secret path/token. */
function hostOf(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function errorMessage(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}
	return typeof err === "string" ? err : "notify webhook request failed";
}
