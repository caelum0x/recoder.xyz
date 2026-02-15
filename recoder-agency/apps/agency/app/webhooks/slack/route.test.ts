import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const afterTasks: Promise<unknown>[] = [];

vi.mock("next/server", () => {
	return {
		after: (fn: () => unknown | Promise<unknown>) => {
			afterTasks.push(Promise.resolve().then(fn));
		},
	};
});

vi.mock("@/db", () => {
	return {
		db: {
			select: vi.fn(),
		},
		flowTriggers: {},
	};
});

vi.mock("@/app/giselle", () => {
	return {
		giselle: {
			getTrigger: vi.fn(),
			handleSlackTrigger: vi.fn(),
		},
		githubWebhookCallbacks: {
			onGenerationComplete: vi.fn(),
			onGenerationError: vi.fn(),
			onTaskCreate: vi.fn(),
		},
	};
});

vi.mock("@/lib/logger", () => {
	return {
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		},
	};
});

import { giselle } from "@/app/giselle";
import { db } from "@/db";
import { POST } from "./route";

const mockedGiselle = giselle as unknown as {
	getTrigger: ReturnType<typeof vi.fn>;
	handleSlackTrigger: ReturnType<typeof vi.fn>;
};

function signSlackRequest(body: string, secret: string, timestamp?: number) {
	const ts = String(timestamp ?? Math.floor(Date.now() / 1000));
	const base = `v0:${ts}:${body}`;
	const sig = createHmac("sha256", secret).update(base).digest("hex");
	return {
		timestamp: ts,
		signature: `v0=${sig}`,
	};
}

async function flushAfterTasks() {
	await Promise.all(afterTasks.splice(0));
}

describe("POST /webhooks/slack", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		afterTasks.length = 0;
		process.env.SLACK_SIGNING_SECRET = "test-slack-secret";
	});

	it("rejects bad signature", async () => {
		const body = JSON.stringify({
			type: "event_callback",
			event: { type: "message", channel: "C123", user: "U123", text: "hi", ts: "1.23" },
		});

		const request = new Request("https://example.com/webhooks/slack", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-slack-request-timestamp": String(Math.floor(Date.now() / 1000)),
				"x-slack-signature": "v0=deadbeef",
			},
			body,
		});

		const response = await POST(request);
		expect(response.status).toBe(401);
		expect(vi.mocked(db.select)).not.toHaveBeenCalled();
		expect(mockedGiselle.handleSlackTrigger).not.toHaveBeenCalled();
	});

	it("passes url_verification challenge with valid signature", async () => {
		const payload = { type: "url_verification", challenge: "abc123" };
		const body = JSON.stringify(payload);
		const signed = signSlackRequest(body, process.env.SLACK_SIGNING_SECRET as string);

		const request = new Request("https://example.com/webhooks/slack", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-slack-request-timestamp": signed.timestamp,
				"x-slack-signature": signed.signature,
			},
			body,
		});

		const response = await POST(request);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ challenge: "abc123" });
		expect(vi.mocked(db.select)).not.toHaveBeenCalled();
	});

	it("ignores bot messages", async () => {
		const payload = {
			type: "event_callback",
			event: {
				type: "message",
				channel: "C123",
				user: "U123",
				bot_id: "B123",
				text: "bot message",
				ts: "1.23",
			},
		};
		const body = JSON.stringify(payload);
		const signed = signSlackRequest(body, process.env.SLACK_SIGNING_SECRET as string);

		const request = new Request("https://example.com/webhooks/slack", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-slack-request-timestamp": signed.timestamp,
				"x-slack-signature": signed.signature,
			},
			body,
		});

		const response = await POST(request);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: true });
		expect(vi.mocked(db.select)).not.toHaveBeenCalled();
		expect(mockedGiselle.handleSlackTrigger).not.toHaveBeenCalled();
	});

	it("dispatches matching triggers", async () => {
		const payload = {
			type: "event_callback",
			event: {
				type: "message",
				channel: "C_MATCH",
				user: "U123",
				text: "hello",
				ts: "1711111111.000001",
			},
		};
		const body = JSON.stringify(payload);
		const signed = signSlackRequest(body, process.env.SLACK_SIGNING_SECRET as string);

		vi.mocked(db.select).mockReturnValue({
			from: async () => [
				{ sdkFlowTriggerId: "trg_match" },
				{ sdkFlowTriggerId: "trg_other_channel" },
			],
		} as never);

		mockedGiselle.getTrigger.mockImplementation(async ({ triggerId }: { triggerId: string }) => {
			if (triggerId === "trg_match") {
				return {
					id: "trg_match",
					enable: true,
					nodeId: "node_1",
					workspaceId: "ws_1",
					configuration: {
						provider: "slack",
						channelId: "C_MATCH",
						event: { id: "slack.message.received" },
					},
				};
			}
			return {
				id: "trg_other_channel",
				enable: true,
				nodeId: "node_2",
				workspaceId: "ws_2",
				configuration: {
					provider: "slack",
					channelId: "C_OTHER",
					event: { id: "slack.message.received" },
				},
			};
		});

		const request = new Request("https://example.com/webhooks/slack", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-slack-request-timestamp": signed.timestamp,
				"x-slack-signature": signed.signature,
			},
			body,
		});

		const response = await POST(request);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: true });

		await flushAfterTasks();

		expect(vi.mocked(db.select)).toHaveBeenCalledTimes(1);
		expect(mockedGiselle.getTrigger).toHaveBeenCalledTimes(2);
		expect(mockedGiselle.handleSlackTrigger).toHaveBeenCalledTimes(1);
		expect(mockedGiselle.handleSlackTrigger.mock.calls[0][0]).toMatchObject({
			payload: expect.objectContaining({
				channelId: "C_MATCH",
				userId: "U123",
				text: "hello",
			}),
		});
	});
});
