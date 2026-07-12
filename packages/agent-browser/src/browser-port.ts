/**
 * browser-port — the structural contracts for the Browser engine (RECODER-ENGINES
 * E9 browser-use). Two seams:
 *
 *  - `BrowserDriver`: the low-level, INJECTED backend that actually drives a page
 *    (the default is a lazily dynamic-imported puppeteer; an HTTP driver hits a
 *    browser-use service). The engine owns NO driver — it is composed in.
 *  - `BrowserEngine`: the owned engine surface the MCP skin calls
 *    (`navigate` / `extractText` / `screenshot`), each returning a truthful
 *    `status` result.
 *
 * DEGRADE CONTRACT (the hard rule): a driver signals "not wired" by throwing
 * {@link BrowserNotConfiguredError}; the engine maps that to
 * `status: 'not_configured'` (with a truthful reason) and any other failure to
 * `status: 'error'`. Nothing throws out of the engine and nothing is fabricated.
 */

/** Discriminated status every engine op returns. */
export type BrowserStatus = "ok" | "not_configured" | "error";

export interface NavigateResult {
	status: BrowserStatus;
	/** Final (post-redirect) URL when known. */
	url?: string;
	/** Page `<title>` when known. */
	title?: string;
	/** HTTP status of the main navigation, when the driver reports one. */
	httpStatus?: number;
	/** Which driver ran ('puppeteer' | 'http' | 'none' | fake) — truthful health. */
	driver?: string;
	/** Truthful reason when degraded (not_configured) or failed (error). */
	reason?: string;
}

export interface ExtractResult {
	status: BrowserStatus;
	/** Extracted visible text (empty string when the page had none). */
	text?: string;
	url?: string;
	driver?: string;
	reason?: string;
}

export interface ScreenshotResult {
	status: BrowserStatus;
	/** Base64-encoded PNG when captured. Optional: heavy, may be omitted. */
	imageBase64?: string;
	url?: string;
	driver?: string;
	reason?: string;
}

/** Raw navigation payload a driver returns (the engine wraps it in a status). */
export interface DriverNavigation {
	url?: string;
	title?: string;
	httpStatus?: number;
}

export interface DriverExtraction {
	text: string;
	url?: string;
}

export interface DriverScreenshot {
	imageBase64?: string;
	url?: string;
}

/**
 * The injected browser backend. Each method drives a real (or fake) page and
 * returns RAW data. To signal "not configured" (no puppeteer installed, no
 * BROWSER_USE_URL), a driver THROWS {@link BrowserNotConfiguredError}; any other
 * throw is treated as an operational error. Drivers never fabricate results.
 */
export interface BrowserDriver {
	/** Which backend this is — surfaced for truthful health ('puppeteer' | 'http' | 'none'). */
	readonly kind: string;
	navigate(url: string): Promise<DriverNavigation>;
	/** Extract text; `url` optional — omitted means "the current page" if supported. */
	extractText(url?: string): Promise<DriverExtraction>;
	screenshot(url?: string): Promise<DriverScreenshot>;
}

export interface BrowserEngine {
	navigate(url: string): Promise<NavigateResult>;
	extractText(url?: string): Promise<ExtractResult>;
	screenshot(url?: string): Promise<ScreenshotResult>;
}

/**
 * Thrown by a driver when its backend is not wired (puppeteer absent, no
 * BROWSER_USE_URL, launch impossible). The engine maps this to
 * `status: 'not_configured'` instead of `error`, so the degrade is truthful and
 * distinguishable from an operational failure.
 */
export class BrowserNotConfiguredError extends Error {
	/** Structural marker so the mapping works across module/realm boundaries. */
	readonly notConfigured = true as const;
	constructor(reason: string) {
		super(reason);
		this.name = "BrowserNotConfiguredError";
	}
}

/** True when `value` is (structurally) a not-configured signal. */
export function isNotConfigured(value: unknown): boolean {
	return (
		value instanceof BrowserNotConfiguredError ||
		(typeof value === "object" &&
			value !== null &&
			(value as { notConfigured?: unknown }).notConfigured === true)
	);
}

/** Narrow any thrown value to a human-readable message. */
export function errorMessage(value: unknown): string {
	if (value instanceof Error) return value.message;
	return typeof value === "string" ? value : String(value);
}
