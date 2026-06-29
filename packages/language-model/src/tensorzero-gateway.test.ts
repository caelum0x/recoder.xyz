import { describe, expect, it } from "vitest";
import {
	isTensorZeroGatewayEnabled,
	resolveTensorZeroRoute,
	TENSORZERO_GATEWAY_API_KEY_ENV,
	TENSORZERO_GATEWAY_URL_ENV,
	tensorZeroModelName,
} from "./tensorzero-gateway";

const openaiModel = { provider: "openai", id: "gpt-5" } as const;
const anthropicModel = { provider: "anthropic", id: "claude-haiku-4.5" } as const;
const googleModel = { provider: "google", id: "gemini-2.5-flash" } as const;
const falModel = { provider: "fal", id: "flux" } as const;

describe("tensorzero gateway seam", () => {
	describe("isTensorZeroGatewayEnabled", () => {
		it("is disabled when env var is missing", () => {
			expect(isTensorZeroGatewayEnabled({})).toBe(false);
		});

		it("is disabled when env var is empty/whitespace", () => {
			expect(
				isTensorZeroGatewayEnabled({ [TENSORZERO_GATEWAY_URL_ENV]: "  " }),
			).toBe(false);
		});

		it("is enabled when env var is set", () => {
			expect(
				isTensorZeroGatewayEnabled({
					[TENSORZERO_GATEWAY_URL_ENV]: "http://localhost:3000",
				}),
			).toBe(true);
		});
	});

	describe("resolveTensorZeroRoute", () => {
		it("returns null when gateway is not configured (direct path)", () => {
			expect(resolveTensorZeroRoute(openaiModel, {})).toBeNull();
		});

		it("returns null for empty url", () => {
			expect(
				resolveTensorZeroRoute(openaiModel, {
					[TENSORZERO_GATEWAY_URL_ENV]: "",
				}),
			).toBeNull();
		});

		it("appends /openai/v1 to the gateway base url", () => {
			const route = resolveTensorZeroRoute(openaiModel, {
				[TENSORZERO_GATEWAY_URL_ENV]: "http://localhost:3000",
			});
			expect(route?.baseURL).toBe("http://localhost:3000/openai/v1");
		});

		it("normalizes trailing slashes", () => {
			const route = resolveTensorZeroRoute(openaiModel, {
				[TENSORZERO_GATEWAY_URL_ENV]: "https://tz.internal///",
			});
			expect(route?.baseURL).toBe("https://tz.internal/openai/v1");
		});

		it("respects a url already pointing at the openai-compatible path", () => {
			const route = resolveTensorZeroRoute(openaiModel, {
				[TENSORZERO_GATEWAY_URL_ENV]: "https://tz.internal/openai/v1",
			});
			expect(route?.baseURL).toBe("https://tz.internal/openai/v1");
		});

		it("builds the tensorzero model name shorthand for openai", () => {
			const route = resolveTensorZeroRoute(openaiModel, {
				[TENSORZERO_GATEWAY_URL_ENV]: "http://localhost:3000",
			});
			expect(route?.modelName).toBe("tensorzero::model_name::openai::gpt-5");
			expect(route?.providerSegment).toBe("openai");
		});

		it("maps google to google_ai_studio_gemini segment", () => {
			const route = resolveTensorZeroRoute(googleModel, {
				[TENSORZERO_GATEWAY_URL_ENV]: "http://localhost:3000",
			});
			expect(route?.modelName).toBe(
				"tensorzero::model_name::google_ai_studio_gemini::gemini-2.5-flash",
			);
		});

		it("maps anthropic models", () => {
			const route = resolveTensorZeroRoute(anthropicModel, {
				[TENSORZERO_GATEWAY_URL_ENV]: "http://localhost:3000",
			});
			expect(route?.modelName).toBe(
				"tensorzero::model_name::anthropic::claude-haiku-4.5",
			);
		});

		it("returns null for providers with no tensorzero mapping (fal)", () => {
			expect(
				resolveTensorZeroRoute(falModel, {
					[TENSORZERO_GATEWAY_URL_ENV]: "http://localhost:3000",
				}),
			).toBeNull();
		});

		it("includes apiKey only when the auth env var is set", () => {
			const withKey = resolveTensorZeroRoute(openaiModel, {
				[TENSORZERO_GATEWAY_URL_ENV]: "http://localhost:3000",
				[TENSORZERO_GATEWAY_API_KEY_ENV]: "tz-secret",
			});
			expect(withKey?.apiKey).toBe("tz-secret");

			const withoutKey = resolveTensorZeroRoute(openaiModel, {
				[TENSORZERO_GATEWAY_URL_ENV]: "http://localhost:3000",
			});
			expect(withoutKey?.apiKey).toBeUndefined();
		});
	});

	describe("tensorZeroModelName", () => {
		it("builds shorthand for known providers", () => {
			expect(tensorZeroModelName("openai", "gpt-5")).toBe(
				"tensorzero::model_name::openai::gpt-5",
			);
			expect(tensorZeroModelName("perplexity", "sonar")).toBe(
				"tensorzero::model_name::perplexity::sonar",
			);
		});

		it("returns null for unknown providers", () => {
			expect(tensorZeroModelName("fal", "flux")).toBeNull();
		});

		it("returns null for empty model id", () => {
			expect(tensorZeroModelName("openai", "")).toBeNull();
		});
	});
});
