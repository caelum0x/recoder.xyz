import { buildRateLimitHeaders } from "./rate-limit";

type CronRateLimitState = {
	count: number;
	windowStartMs: number;
};

type ConsumeCronRateLimitArgs = {
	routeKey: string;
	now?: Date;
};

type ConsumeCronRateLimitResult = {
	allowed: boolean;
	limit: number;
	remaining: number;
	resetAt: Date;
	retryAfterSeconds: number;
};

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 5;

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getCronWindowMs(): number {
	return parsePositiveInt(
		process.env.CRON_RATE_LIMIT_WINDOW_MS,
		DEFAULT_WINDOW_MS,
	);
}

function getCronMaxRequests(): number {
	return parsePositiveInt(
		process.env.CRON_RATE_LIMIT_MAX_REQUESTS,
		DEFAULT_MAX_REQUESTS,
	);
}

function getStore(): Map<string, CronRateLimitState> {
	const globalScope = globalThis as typeof globalThis & {
		__agencyCronRateLimitStore?: Map<string, CronRateLimitState>;
	};
	if (!globalScope.__agencyCronRateLimitStore) {
		globalScope.__agencyCronRateLimitStore = new Map();
	}
	return globalScope.__agencyCronRateLimitStore;
}

export function __resetCronRateLimitStoreForTests() {
	getStore().clear();
}

export function consumeCronRateLimit(
	args: ConsumeCronRateLimitArgs,
): ConsumeCronRateLimitResult {
	const now = args.now ?? new Date();
	const windowMs = getCronWindowMs();
	const limit = getCronMaxRequests();
	const routeKey = args.routeKey;

	const nowMs = now.getTime();
	const windowStartMs = Math.floor(nowMs / windowMs) * windowMs;
	const resetAt = new Date(windowStartMs + windowMs);
	const store = getStore();
	const key = `${routeKey}:${windowStartMs}`;

	const entry = store.get(key);
	const count = (entry?.count ?? 0) + 1;
	store.set(key, { count, windowStartMs });

	const allowed = count <= limit;
	const remaining = Math.max(0, limit - count);
	const retryAfterSeconds = Math.max(
		0,
		Math.ceil((resetAt.getTime() - nowMs) / 1000),
	);

	// Best-effort cleanup so this in-memory map does not grow indefinitely.
	for (const [existingKey, existingEntry] of store.entries()) {
		if (existingEntry.windowStartMs + windowMs < windowStartMs) {
			store.delete(existingKey);
		}
	}

	return {
		allowed,
		limit,
		remaining,
		resetAt,
		retryAfterSeconds,
	};
}

export function buildCronRateLimitHeaders(args: {
	limit: number;
	remaining: number;
	resetAt: Date;
	retryAfterSeconds?: number;
}) {
	return buildRateLimitHeaders(args);
}
