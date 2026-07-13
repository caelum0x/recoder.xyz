import { describe, expect, it } from "vitest";
import { createNotifyEngine, type NotifyFetch, type NotifyHttpResponse } from "./notify-engine.js";

// ── Fakes (no network) ─────────────────────────────────────────────────────────

interface Recorded {
	url: string;
	body: string;
}

/**
 * A fetch that records the call and returns a caller-chosen status. `calls`
 * captures the resolved url + payload so tests can assert routing + text.
 */
function fakeFetch(status = 200): NotifyFetch & { calls: Recorded[] } {
	const calls: Recorded[] = [];
	const impl = (async (url, init) => {
		calls.push({ url, body: init.body });
		return httpResponse(status);
	}) as NotifyFetch & { calls: Recorded[] };
	impl.calls = calls;
	return impl;
}

/** A fetch that always throws — the network-failure degrade path. */
function throwingFetch(): NotifyFetch & { calls: Recorded[] } {
	const calls: Recorded[] = [];
	const impl = (async () => {
		throw new Error("connection refused");
	}) as NotifyFetch & { calls: Recorded[] };
	impl.calls = calls;
	return impl;
}

function httpResponse(status: number): NotifyHttpResponse {
	return { ok: status >= 200 && status < 300, status };
}

// ── engine ──────────────────────────────────────────────────────────────────

describe("createNotifyEngine", () => {
	it("sends on 2xx and posts the correct payload to the resolved url", async () => {
		const fetch = fakeFetch(200);
		const engine = createNotifyEngine({
			fetch,
			env: { RECODER_NOTIFY_URL: "https://hooks.example.com/services/abc" },
		});

		const result = await engine.notify({
			message: "delivery ready for review",
			title: "Recoder",
			level: "info",
		});

		expect(result.status).toBe("sent");
		expect(result.level).toBe("info");
		expect(result.target).toBe("hooks.example.com");
		expect(fetch.calls).toHaveLength(1);
		expect(fetch.calls[0].url).toBe("https://hooks.example.com/services/abc");
		// Slack-style payload: `${title}: ${message}`.
		expect(JSON.parse(fetch.calls[0].body)).toEqual({
			text: "Recoder: delivery ready for review",
		});
	});

	it("omits the title prefix when no title is given", async () => {
		const fetch = fakeFetch(200);
		const engine = createNotifyEngine({
			fetch,
			env: { SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/xyz" },
		});

		const result = await engine.notify({ message: "build is green" });
		expect(result.status).toBe("sent");
		expect(JSON.parse(fetch.calls[0].body)).toEqual({ text: "build is green" });
	});

	// ── degrade-safe ───────────────────────────────────────────────────────────

	it("degrades to not_configured with no url and no env", async () => {
		const fetch = fakeFetch(200);
		const engine = createNotifyEngine({ fetch, env: {} });

		const result = await engine.notify({ message: "nobody listening" });
		expect(result.status).toBe("not_configured");
		expect(result.reason).toMatch(/not configured/);
		// Never fabricates a send — no network touched.
		expect(fetch.calls).toHaveLength(0);
	});

	it("returns error (not throw) on a non-2xx webhook response", async () => {
		const fetch = fakeFetch(500);
		const engine = createNotifyEngine({
			fetch,
			env: { RECODER_NOTIFY_URL: "https://hooks.example.com/x" },
		});

		const result = await engine.notify({ message: "server sad" });
		expect(result.status).toBe("error");
		expect(result.reason).toMatch(/500/);
		expect(result.target).toBe("hooks.example.com");
	});

	it("returns error (caught) when fetch throws", async () => {
		const fetch = throwingFetch();
		const engine = createNotifyEngine({
			fetch,
			env: { RECODER_NOTIFY_URL: "https://hooks.example.com/x" },
		});

		const result = await engine.notify({ message: "network down" });
		expect(result.status).toBe("error");
		expect(result.reason).toMatch(/connection refused/);
	});

	// ── resolution precedence ────────────────────────────────────────────────────

	it("prefers input.url over env when both are present", async () => {
		const fetch = fakeFetch(200);
		const engine = createNotifyEngine({
			fetch,
			env: {
				RECODER_NOTIFY_URL: "https://env-recoder.example.com/hook",
				SLACK_WEBHOOK_URL: "https://env-slack.example.com/hook",
			},
		});

		const result = await engine.notify({
			message: "override me",
			url: "https://per-call.example.com/hook",
		});
		expect(result.status).toBe("sent");
		expect(fetch.calls[0].url).toBe("https://per-call.example.com/hook");
	});

	it("falls back RECODER_NOTIFY_URL before SLACK_WEBHOOK_URL", async () => {
		const fetch = fakeFetch(200);
		const engine = createNotifyEngine({
			fetch,
			env: {
				RECODER_NOTIFY_URL: "https://primary.example.com/hook",
				SLACK_WEBHOOK_URL: "https://fallback.example.com/hook",
			},
		});

		await engine.notify({ message: "which url" });
		expect(fetch.calls[0].url).toBe("https://primary.example.com/hook");
	});
});
