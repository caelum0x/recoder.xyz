import { z } from "zod/v4";

const PLACEHOLDER_PATTERNS = [
	/^changeme$/i,
	/^placeholder$/i,
	/^xxx+$/i,
	/^todo$/i,
	/^replace.?me$/i,
	/^your[_-]?secret$/i,
	/^secret$/i,
	/^password$/i,
];

const MIN_SECRET_LENGTH = 16;

function isPlaceholder(value: string): boolean {
	return PLACEHOLDER_PATTERNS.some((p) => p.test(value));
}

const secretString = z
	.string()
	.min(MIN_SECRET_LENGTH, `Must be at least ${MIN_SECRET_LENGTH} characters`)
	.refine((v) => !isPlaceholder(v), "Looks like a placeholder value");

const isProduction = () => process.env.NODE_ENV === "production";

const optionalNonEmpty = z
	.union([z.string().min(1), z.literal("").transform(() => undefined)])
	.optional();

const serverEnvSchema = z.object({
	DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
	AUTH_DATABASE_URL: z.string().min(1, "AUTH_DATABASE_URL is required"),
	BETTER_AUTH_SECRET: secretString,
	BETTER_AUTH_URL: optionalNonEmpty,
	CHANNEL_GATEWAY_SHARED_SECRET: z
		.union([secretString, z.literal("").transform(() => undefined)])
		.optional(),
	COOKIE_SECRET: z
		.union([secretString, z.literal("").transform(() => undefined)])
		.optional(),
	TOKEN_ENCRYPTION_KEY: z
		.union([secretString, z.literal("").transform(() => undefined)])
		.optional(),
	POLAR_ACCESS_TOKEN: optionalNonEmpty,
	POLAR_PRO_PRODUCT_ID: optionalNonEmpty,
	POLAR_WEBHOOK_SECRET: optionalNonEmpty,
	POLAR_ORGANIZATION_ID: optionalNonEmpty,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function validateEnv(): ServerEnv {
	const result = serverEnvSchema.safeParse({
		DATABASE_URL: process.env.DATABASE_URL,
		AUTH_DATABASE_URL: process.env.AUTH_DATABASE_URL,
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
		CHANNEL_GATEWAY_SHARED_SECRET: process.env.CHANNEL_GATEWAY_SHARED_SECRET,
		COOKIE_SECRET: process.env.COOKIE_SECRET,
		TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
		POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
		POLAR_PRO_PRODUCT_ID: process.env.POLAR_PRO_PRODUCT_ID,
		POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
		POLAR_ORGANIZATION_ID: process.env.POLAR_ORGANIZATION_ID,
	});

	if (!result.success) {
		const formatted = z.prettifyError(result.error);
		throw new Error(
			`[env-validation] Invalid environment variables:\n${formatted}\nSee apps/agency/.env.example for reference.`,
		);
	}

	if (isProduction()) {
		const prodMissing: string[] = [];
		if (!process.env.COOKIE_SECRET) prodMissing.push("COOKIE_SECRET");
		if (!process.env.TOKEN_ENCRYPTION_KEY)
			prodMissing.push("TOKEN_ENCRYPTION_KEY");
		if (!process.env.AUTH_DATABASE_URL) prodMissing.push("AUTH_DATABASE_URL");
		if (!process.env.BETTER_AUTH_URL) prodMissing.push("BETTER_AUTH_URL");
		if (prodMissing.length > 0) {
			throw new Error(
				`[env-validation] Required in production: ${prodMissing.join(", ")}.`,
			);
		}

		// Polar payment vars are optional — warn if missing but don't block startup
		const polarMissing = [
			"POLAR_ACCESS_TOKEN",
			"POLAR_PRO_PRODUCT_ID",
			"POLAR_WEBHOOK_SECRET",
			"POLAR_ORGANIZATION_ID",
		].filter((key) => !process.env[key]);
		if (polarMissing.length > 0) {
			console.warn(
				`[env-validation] Polar payment variables not set: ${polarMissing.join(", ")}. Billing features will be disabled.`,
			);
		}
	} else {
		const recommended = [
			"AUTH_DATABASE_URL",
			"BETTER_AUTH_URL",
			"CHANNEL_GATEWAY_SHARED_SECRET",
			"COOKIE_SECRET",
			"TOKEN_ENCRYPTION_KEY",
		].filter((key) => !process.env[key]);
		if (recommended.length > 0) {
			console.warn(
				`[env-validation] Recommended environment variables not set: ${recommended.join(", ")}. ` +
					"The app will start, but some features may not work correctly.",
			);
		}
	}

	validateDatabaseUrlShape();
	validateConditionalFeatureEnv();
	validateOAuthConfig();
	validateCronRateLimitEnv();

	return result.data;
}

function validateDatabaseUrlShape(): void {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) return;

	if (/\s/.test(databaseUrl)) {
		throw new Error(
			"[env-validation] DATABASE_URL contains whitespace/newlines. Keep the connection string on a single line.",
		);
	}

	const appearsPooled =
		databaseUrl.includes("-pooler.") ||
		databaseUrl.includes("pgbouncer=true") ||
		databaseUrl.includes("connection_limit=");
	if (!appearsPooled) {
		console.warn(
			"[env-validation] DATABASE_URL does not look like a pooled connection string. Consider pooled URLs for production/staging.",
		);
	}

	validateDatabaseUrlRuntimeSafety("DATABASE_URL", databaseUrl);
	validateDatabaseUrlRuntimeSafety(
		"AUTH_DATABASE_URL",
		process.env.AUTH_DATABASE_URL,
	);
}

function validateDatabaseUrlRuntimeSafety(
	name: "DATABASE_URL" | "AUTH_DATABASE_URL",
	value?: string,
): void {
	if (!value) return;

	const lower = value.toLowerCase();
	if (
		lower.startsWith("file:") ||
		lower.endsWith(".db") ||
		lower.endsWith(".sqlite") ||
		lower.endsWith(".sqlite3") ||
		lower.includes("sqlite")
	) {
		throw new Error(
			`[env-validation] ${name} looks like a SQLite URL. This app requires PostgreSQL.`,
		);
	}

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`[env-validation] ${name} must be a valid URL.`);
	}

	const protocol = parsed.protocol.toLowerCase();
	if (protocol !== "postgresql:" && protocol !== "postgres:") {
		throw new Error(
			`[env-validation] ${name} must use a PostgreSQL URL (postgresql:// or postgres://).`,
		);
	}

	if (isProduction() && process.env.ALLOW_LOCALHOST_DB !== "true") {
		const host = parsed.hostname.toLowerCase();
		const isLocalHost =
			host === "localhost" ||
			host === "127.0.0.1" ||
			host === "::1" ||
			host === "[::1]";
		if (isLocalHost) {
			throw new Error(
				`[env-validation] ${name} must not point to localhost in production. Set ALLOW_LOCALHOST_DB=true to override (e.g. local Docker Postgres).`,
			);
		}
	}
}

function validateConditionalFeatureEnv(): void {
	if (process.env.NEXT_PUBLIC_ENABLE_POSTHOG === "true") {
		const missing = [
			"NEXT_PUBLIC_POSTHOG_KEY",
			"NEXT_PUBLIC_POSTHOG_HOST",
		].filter((key) => !process.env[key]);
		if (missing.length > 0) {
			throw new Error(
				`[env-validation] PostHog is enabled but missing: ${missing.join(", ")}.`,
			);
		}
	}

	if (
		process.env.SENTRY_ENABLED === "true" &&
		!process.env.NEXT_PUBLIC_SENTRY_DSN
	) {
		throw new Error(
			"[env-validation] SENTRY_ENABLED=true requires NEXT_PUBLIC_SENTRY_DSN.",
		);
	}
}

function validateOAuthConfig(): void {
	const googleId = process.env.GOOGLE_OAUTH_CLIENT_ID;
	const googleSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

	if ((googleId && !googleSecret) || (!googleId && googleSecret)) {
		throw new Error(
			"[env-validation] GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must both be set together.",
		);
	}

	const hasDeprecatedGoogleAlias =
		Boolean(process.env.GOOGLE_CLIENT_ID) ||
		Boolean(process.env.GOOGLE_CLIENT_SECRET);
	if (hasDeprecatedGoogleAlias && (!googleId || !googleSecret)) {
		console.warn(
			"[env-validation] GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are deprecated aliases. Use GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET.",
		);
	}
}

function validateCronRateLimitEnv(): void {
	const maxRequestsRaw = process.env.CRON_RATE_LIMIT_MAX_REQUESTS;
	const windowMsRaw = process.env.CRON_RATE_LIMIT_WINDOW_MS;

	if (maxRequestsRaw) {
		const parsed = Number.parseInt(maxRequestsRaw, 10);
		if (!Number.isFinite(parsed) || parsed <= 0) {
			throw new Error(
				"[env-validation] CRON_RATE_LIMIT_MAX_REQUESTS must be a positive integer.",
			);
		}
	}

	if (windowMsRaw) {
		const parsed = Number.parseInt(windowMsRaw, 10);
		if (!Number.isFinite(parsed) || parsed <= 0) {
			throw new Error(
				"[env-validation] CRON_RATE_LIMIT_WINDOW_MS must be a positive integer (milliseconds).",
			);
		}
	}
}
