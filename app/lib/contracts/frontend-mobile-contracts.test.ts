import { describe, expect, it } from "vitest";

import { parseSessionTokenResponse } from "../../../apps/frontend/src/lib/auth/contracts";
import {
	parseHealthCheckResponse,
	parseMessagesResponse,
	parseNotificationLogsResponse,
	parseThreadSearchResponse,
} from "../../../apps/frontend/src/lib/api/contracts";
import {
	parseAccountInitializationResponse,
	parseAuthProviderError,
	parseProviderKeysResponse,
} from "../../../apps/mobile/lib/auth/contracts";
import {
	parseAccountDeletionStatus,
	parseAgentRunStatusResponse,
	parseApiErrorMessage,
	parseCustomMcpResponse,
	parseSystemStatusPayload,
	parseToolsMetadataResponse,
} from "../../../apps/mobile/api/contracts";

describe("frontend-auth-api contracts", () => {
	it("accepts frontend session token payload", () => {
		expect(
			parseSessionTokenResponse({
				data: { accessToken: "token_123" },
			}),
		).toEqual({ data: { accessToken: "token_123" } });
	});

	it("rejects malformed frontend health payload", () => {
		expect(() =>
			parseHealthCheckResponse({
				status: "ok",
				timestamp: "2026-02-15T00:00:00Z",
			}),
		).toThrow();
	});

	it("accepts frontend notification logs payload", () => {
		expect(
			parseNotificationLogsResponse({
				logs: [
					{
						id: "log_1",
						user_id: "user_1",
						event_type: "security",
						channel: "email",
						status: "sent",
						created_at: "2026-02-15T00:00:00Z",
					},
				],
			}),
		).toMatchObject({ logs: [{ id: "log_1" }] });
	});

	it("rejects malformed thread search payload", () => {
		expect(() =>
			parseThreadSearchResponse({
				results: [{ thread_id: "thread_1", score: "high" }],
				total: 1,
				configured: true,
			}),
		).toThrow();
	});

	it("accepts frontend messages payload", () => {
		expect(
			parseMessagesResponse({
				messages: [{ role: "assistant", content: "ok", type: "text" }],
			}),
		).toEqual({
			messages: [{ role: "assistant", content: "ok", type: "text" }],
		});
	});
});

describe("mobile-auth-session contracts", () => {
	it("parses auth provider error envelope", () => {
		expect(parseAuthProviderError({ error: { message: "Denied" } })).toEqual({
			message: "Denied",
		});
	});

	it("accepts account initialization payload", () => {
		expect(
			parseAccountInitializationResponse({
				success: true,
				message: "initialized",
				subscription_id: "sub_123",
			}),
		).toEqual({
			success: true,
			message: "initialized",
			subscription_id: "sub_123",
		});
	});

	it("normalizes provider keys payload", () => {
		expect(parseProviderKeysResponse({ keys: { openai: "k1", bad: 1 } })).toEqual(
			{
				keys: { openai: "k1" },
			},
		);
	});

	it("accepts account deletion status payload", () => {
		expect(
			parseAccountDeletionStatus({
				has_pending_deletion: false,
				deletion_scheduled_for: null,
				requested_at: null,
				can_cancel: false,
			}),
		).toEqual({
			has_pending_deletion: false,
			deletion_scheduled_for: null,
			requested_at: null,
			can_cancel: false,
		});
	});

	it("parses system status payload", () => {
		expect(
			parseSystemStatusPayload({
				maintenanceNotice: { enabled: false },
				technicalIssue: { enabled: true, severity: "degraded" },
			}),
		).toMatchObject({
			maintenanceNotice: { enabled: false },
			technicalIssue: { enabled: true, severity: "degraded" },
		});
	});

	it("accepts custom MCP response payload", () => {
		expect(
			parseCustomMcpResponse({
				success: true,
				tools: [{ name: "search", description: "Search tool" }],
			}),
		).toEqual({
			success: true,
			tools: [{ name: "search", description: "Search tool", parameters: undefined }],
			serverName: undefined,
			processedConfig: undefined,
			message: undefined,
		});
	});

	it("accepts tools metadata payload and error message parsing", () => {
		expect(
			parseToolsMetadataResponse({
				success: true,
				tools: [
					{
						name: "web",
						display_name: "Web",
						description: "Web search",
						tool_class: "search",
						enabled: true,
						methods: [
							{
								name: "query",
								display_name: "Query",
								description: "Run query",
								enabled: true,
							},
						],
					},
				],
			}),
		).toMatchObject({
			success: true,
			tools: {
				web: {
					name: "web",
				},
			},
		});

		expect(parseApiErrorMessage({ detail: "bad request" })).toBe("bad request");
		expect(parseAgentRunStatusResponse({ status: "running" })).toEqual({
			status: "running",
		});
	});
});
