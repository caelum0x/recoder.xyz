import assert from "node:assert/strict";
import test from "node:test";
import type { NormalizedMessage } from "./connectors/types.js";

const sampleMessage: NormalizedMessage = {
	provider: "slack",
	messageId: "m-1",
	threadId: "th-1",
	channelId: "C123",
	channelType: "channel",
	senderId: "U123",
	senderDisplayName: "Tester",
	text: "hello",
	rawEvent: {},
	receivedAt: new Date().toISOString(),
};

async function loadDispatchNormalizedMessages() {
	const moduleUrl = new URL(`./dispatch.ts?t=${Date.now()}-${Math.random()}`, import.meta.url);
	const mod = await import(moduleUrl.href);
	return mod.dispatchNormalizedMessages as (
		messages: NormalizedMessage[],
		requestId?: string,
	) => Promise<void>;
}

test("dispatchNormalizedMessages skips remote dispatch when gateway env is missing", async () => {
	delete process.env.CHANNEL_GATEWAY_AGENCY_URL;
	delete process.env.CHANNEL_GATEWAY_SHARED_SECRET;

	let fetchCalls = 0;
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async () => {
		fetchCalls += 1;
		throw new Error("fetch should not be called when env is missing");
	}) as typeof fetch;

	try {
		const dispatchNormalizedMessages = await loadDispatchNormalizedMessages();
		await dispatchNormalizedMessages([sampleMessage], "dispatch-skip");
		assert.equal(fetchCalls, 0);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
