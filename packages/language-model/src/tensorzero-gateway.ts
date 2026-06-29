/**
 * Optional TensorZero gateway routing (additive, degrade-safe).
 *
 * TensorZero (https://www.tensorzero.com) is an open-source LLM gateway that
 * exposes an OpenAI-compatible inference endpoint at `${GATEWAY_URL}/openai/v1`.
 * Routing LLM traffic through it gives observability, caching, A/B variants and
 * optimization WITHOUT changing call sites: the gateway speaks the OpenAI HTTP
 * protocol, so any OpenAI-compatible client can point at it by overriding
 * `baseURL` and using a `tensorzero::model_name::<provider>::<model>` model name.
 *
 * This module is a LIGHT TypeScript seam only. It does NOT import or build the
 * Rust `tensorzero-core` engine, and it makes NO network calls. It simply reads
 * the `TENSORZERO_GATEWAY_URL` environment variable and, when present, hands
 * callers the config they need to route through the gateway. When the variable
 * is unset (or the gateway is not running) it returns `null`, and callers MUST
 * fall back to their existing direct-provider path.
 *
 * IMPORTANT: enabling this requires a TensorZero gateway to actually be running
 * and reachable at `TENSORZERO_GATEWAY_URL`. This package only computes the
 * routing config; it never verifies connectivity. If the env var points at a
 * dead endpoint, inference will fail at the call site — fail fast, do not fake.
 *
 * Existing exports of this package are unchanged; this is purely additive.
 */

import type { LanguageModelBase } from "./base";

/**
 * Environment variable that opts a deployment into TensorZero gateway routing.
 * Example: `http://localhost:3000` or `https://tensorzero.internal`.
 */
export const TENSORZERO_GATEWAY_URL_ENV = "TENSORZERO_GATEWAY_URL" as const;

/**
 * Optional env var to authenticate against a protected gateway. Read from the
 * environment only — never hardcode a token. When unset, no auth header is sent.
 */
export const TENSORZERO_GATEWAY_API_KEY_ENV =
	"TENSORZERO_GATEWAY_API_KEY" as const;

/**
 * Maps this package's registry `provider` values to the provider segment that
 * TensorZero's OpenAI-compatible `tensorzero::model_name::<provider>::<model>`
 * shorthand expects. See TensorZero's model-provider integration docs.
 *
 * Providers without a known TensorZero mapping (e.g. image-only `fal`) are
 * intentionally absent — `resolveTensorZeroRoute` returns `null` for them so the
 * caller keeps using its direct path instead of guessing a wrong route.
 */
const PROVIDER_TO_TENSORZERO_SEGMENT: Readonly<Record<string, string>> = {
	openai: "openai",
	anthropic: "anthropic",
	google: "google_ai_studio_gemini",
	perplexity: "perplexity",
};

/** Result of resolving a gateway route for a given model. */
export interface TensorZeroRoute {
	/**
	 * OpenAI-compatible base URL to pass to an OpenAI client (`baseURL`).
	 * Always ends in `/openai/v1`.
	 */
	readonly baseURL: string;
	/**
	 * Model name string to send as the `model` field, using the
	 * `tensorzero::model_name::<provider>::<model>` shorthand so no TensorZero
	 * function/variant config is required.
	 */
	readonly modelName: string;
	/**
	 * Optional bearer token read from {@link TENSORZERO_GATEWAY_API_KEY_ENV}.
	 * Undefined when the gateway is unauthenticated.
	 */
	readonly apiKey?: string;
	/** The TensorZero provider segment used to build {@link modelName}. */
	readonly providerSegment: string;
}

/** Minimal environment source (defaults to `process.env`). Injectable for tests. */
export type EnvSource = Record<string, string | undefined>;

function getEnv(env?: EnvSource): EnvSource {
	if (env) {
		return env;
	}
	// `process` may be undefined in some edge runtimes; degrade to empty env.
	return typeof process !== "undefined" && process.env ? process.env : {};
}

/** Normalize a gateway base URL: trim, drop trailing slashes, append `/openai/v1`. */
function toOpenAiCompatibleBaseUrl(rawGatewayUrl: string): string | null {
	const trimmed = rawGatewayUrl.trim();
	if (trimmed.length === 0) {
		return null;
	}
	const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
	// If the caller already pointed at the OpenAI-compatible path, respect it.
	if (/\/openai\/v1$/.test(withoutTrailingSlash)) {
		return withoutTrailingSlash;
	}
	return `${withoutTrailingSlash}/openai/v1`;
}

/**
 * True when a TensorZero gateway URL is configured in the environment.
 * Does NOT check reachability — see module docs.
 */
export function isTensorZeroGatewayEnabled(env?: EnvSource): boolean {
	const value = getEnv(env)[TENSORZERO_GATEWAY_URL_ENV];
	return typeof value === "string" && value.trim().length > 0;
}

/**
 * Build the `tensorzero::model_name::<provider>::<model>` shorthand for a
 * registry provider + model id. Returns `null` when the provider has no known
 * TensorZero mapping (caller should use its direct path).
 */
export function tensorZeroModelName(
	provider: string,
	modelId: string,
): string | null {
	const segment = PROVIDER_TO_TENSORZERO_SEGMENT[provider];
	if (segment === undefined || modelId.length === 0) {
		return null;
	}
	return `tensorzero::model_name::${segment}::${modelId}`;
}

/**
 * Resolve TensorZero gateway routing for a model.
 *
 * Returns a {@link TensorZeroRoute} when ALL of the following hold:
 *  - `TENSORZERO_GATEWAY_URL` is set to a non-empty value, and
 *  - the model's provider has a known TensorZero mapping.
 *
 * Returns `null` otherwise, signalling the caller to use its existing direct
 * provider path. This keeps the gateway strictly opt-in and degrade-safe.
 */
export function resolveTensorZeroRoute(
	model: Pick<LanguageModelBase, "provider" | "id">,
	env?: EnvSource,
): TensorZeroRoute | null {
	const source = getEnv(env);
	const rawUrl = source[TENSORZERO_GATEWAY_URL_ENV];
	if (typeof rawUrl !== "string") {
		return null;
	}
	const baseURL = toOpenAiCompatibleBaseUrl(rawUrl);
	if (baseURL === null) {
		return null;
	}
	const providerSegment = PROVIDER_TO_TENSORZERO_SEGMENT[model.provider];
	if (providerSegment === undefined) {
		return null;
	}
	const modelName = `tensorzero::model_name::${providerSegment}::${model.id}`;
	const apiKey = source[TENSORZERO_GATEWAY_API_KEY_ENV];
	return {
		baseURL,
		modelName,
		providerSegment,
		...(apiKey && apiKey.trim().length > 0
			? { apiKey: apiKey.trim() }
			: {}),
	};
}
