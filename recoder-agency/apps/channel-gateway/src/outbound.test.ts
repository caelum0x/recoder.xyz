import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import test from "node:test";

type MockResponse = ServerResponse & {
	statusCodeCaptured?: number;
	bodyCaptured?: string;
};

function createRequest(headers: Record<string, string | undefined>, body: string) {
	const req = new PassThrough() as IncomingMessage & PassThrough;
	req.headers = headers;
	process.nextTick(() => {
		req.end(body);
	});
	return req;
}

function createResponse(): MockResponse {
	const res = {
		statusCodeCaptured: undefined,
		bodyCaptured: "",
		writeHead(this: MockResponse, statusCode: number) {
			this.statusCodeCaptured = statusCode;
			return this;
		},
		end(this: MockResponse, chunk?: string) {
			this.bodyCaptured = chunk ?? "";
			return this;
		},
	} as unknown as MockResponse;
	return res;
}

async function loadHandleOutbound() {
	const moduleUrl = new URL(`./outbound.ts?t=${Date.now()}-${Math.random()}`, import.meta.url);
	const mod = await import(moduleUrl.href);
	return mod.handleOutbound as (
		req: IncomingMessage,
		res: ServerResponse,
		requestId?: string,
	) => Promise<void>;
}

test("handleOutbound rejects unauthorized requests", async () => {
	process.env.CHANNEL_GATEWAY_SHARED_SECRET = "gateway-secret";
	const handleOutbound = await loadHandleOutbound();

	const req = createRequest({}, "{}");
	const res = createResponse();

	await handleOutbound(req, res, "req-unauthorized");

	assert.equal(res.statusCodeCaptured, 401);
	assert.match(res.bodyCaptured ?? "", /unauthorized/i);
});

test("handleOutbound rejects invalid JSON payloads", async () => {
	process.env.CHANNEL_GATEWAY_SHARED_SECRET = "gateway-secret";
	const handleOutbound = await loadHandleOutbound();

	const req = createRequest(
		{ "x-channel-gateway-secret": "gateway-secret" },
		"{not-valid-json",
	);
	const res = createResponse();

	await handleOutbound(req, res, "req-invalid-json");

	assert.equal(res.statusCodeCaptured, 400);
	assert.match(res.bodyCaptured ?? "", /invalid_json/i);
});

test("handleOutbound rejects payloads missing required fields", async () => {
	process.env.CHANNEL_GATEWAY_SHARED_SECRET = "gateway-secret";
	const handleOutbound = await loadHandleOutbound();

	const req = createRequest(
		{ "x-channel-gateway-secret": "gateway-secret" },
		JSON.stringify({ provider: "slack", text: "hello" }),
	);
	const res = createResponse();

	await handleOutbound(req, res, "req-missing-fields");

	assert.equal(res.statusCodeCaptured, 400);
	assert.match(res.bodyCaptured ?? "", /missing_required_fields/i);
});
