import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "./route";
import { __createSignatureForTest, __resetA2ATestState } from "@/lib/a2a/gateway";

const SECRET = "test-shared-secret";

function envelopeBody() {
	return {
		envelopeVersion: "2026-02-14",
		protocolVersion: "0.3.0",
		messageId: "msg-agency-1",
		threadId: "thread-agency-1",
		createdAt: new Date().toISOString(),
		from: { id: "sender", name: "Sender", platform: "custom" },
		to: { id: "agency", name: "Agency", platform: "recoder_agency" },
		intent: "execute",
		payload: [{ kind: "text", text: "hello" }],
	};
}

async function signedRequest(body: unknown, timestamp: string) {
	const raw = JSON.stringify(body);
	const signature = await __createSignatureForTest(timestamp, raw, SECRET);
	return new Request("http://localhost/api/a2a/envelope", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-recoder-a2a-agent-id": "sender",
			"x-recoder-a2a-timestamp": timestamp,
			"x-recoder-a2a-signature": `v1=${signature}`,
		},
		body: raw,
	});
}

describe("POST /api/a2a/envelope", () => {
	beforeEach(() => {
		process.env.RECODER_A2A_SHARED_SECRET = SECRET;
		process.env.RECODER_A2A_ALLOWED_AGENTS = "sender";
		__resetA2ATestState();
	});

	it("rejects bad signature", async () => {
		const req = new Request("http://localhost/api/a2a/envelope", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-recoder-a2a-agent-id": "sender",
				"x-recoder-a2a-timestamp": `${Math.floor(Date.now() / 1000)}`,
				"x-recoder-a2a-signature": "v1=bad",
			},
			body: JSON.stringify(envelopeBody()),
		});

		const response = await POST(req);
		expect(response.status).toBe(401);
	});

	it("rejects stale timestamp", async () => {
		const stale = `${Math.floor((Date.now() - 10 * 60 * 1000) / 1000)}`;
		const req = await signedRequest(envelopeBody(), stale);
		const response = await POST(req);
		expect(response.status).toBe(401);
	});

	it("returns duplicate on replay", async () => {
		const ts = `${Math.floor(Date.now() / 1000)}`;
		const body = envelopeBody();
		const first = await POST(await signedRequest(body, ts));
		const second = await POST(await signedRequest(body, ts));
		expect(first.status).toBe(200);
		expect(second.status).toBe(202);
	});

	it("returns structured invalid-envelope errors for bad payloads", async () => {
		const ts = `${Math.floor(Date.now() / 1000)}`;
		const badBody = {
			...envelopeBody(),
			payload: [{ kind: "text", text: "" }],
		};

		const response = await POST(await signedRequest(badBody, ts));
		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.code).toBe("INVALID_A2A_ENVELOPE");
		expect(json.schemaVersion).toBe("a2a-envelope-error-v1");
		expect(json.issues).toContainEqual({
			path: "body.payload[0].text",
			message: "must be a non-empty string",
		});
	});
});
