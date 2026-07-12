/**
 * browser-engine — the owned Browser engine (RECODER-ENGINES E9 browser-use). It
 * is a THIN, degrade-safe wrapper around an injected {@link BrowserDriver}:
 *
 *   navigate(url)      → { status, url, title }
 *   extractText(url?)  → { status, text }
 *   screenshot(url?)   → { status, imageBase64? }
 *
 * INJECTABLE BY CONSTRUCTION: the driver is passed in, so unit tests drive the
 * engine with a fake and touch no network / subprocess. The backend composes it
 * over the default driver (puppeteer, or a browser-use HTTP service).
 *
 * DEGRADE-SAFE (the hard rule): a driver that is not wired throws
 * {@link BrowserNotConfiguredError}; the engine maps that to
 * `status: 'not_configured'` with a truthful reason. Any other failure becomes
 * `status: 'error'`. The engine NEVER throws and NEVER fabricates a result.
 */
import {
	errorMessage,
	isNotConfigured,
	type BrowserDriver,
	type BrowserEngine,
	type ExtractResult,
	type NavigateResult,
	type ScreenshotResult,
} from "./browser-port.js";

export interface BrowserEngineDeps {
	/** The injected page backend. See {@link BrowserDriver}. */
	driver: BrowserDriver;
}

export function createBrowserEngine(deps: BrowserEngineDeps): BrowserEngine {
	const { driver } = deps;

	async function navigate(url: string): Promise<NavigateResult> {
		const target = normalizeUrl(url);
		if (!target) {
			return { status: "error", driver: driver.kind, reason: "url is required" };
		}
		try {
			const nav = await driver.navigate(target);
			const result: NavigateResult = {
				status: "ok",
				driver: driver.kind,
				url: nav.url ?? target,
			};
			if (nav.title !== undefined) result.title = nav.title;
			if (nav.httpStatus !== undefined) result.httpStatus = nav.httpStatus;
			return result;
		} catch (err) {
			return degrade(err, driver.kind);
		}
	}

	async function extractText(url?: string): Promise<ExtractResult> {
		const target = url === undefined ? undefined : normalizeUrl(url);
		if (url !== undefined && !target) {
			return { status: "error", driver: driver.kind, reason: "url is required" };
		}
		try {
			const extracted = await driver.extractText(target);
			const result: ExtractResult = {
				status: "ok",
				driver: driver.kind,
				text: extracted.text ?? "",
			};
			if (extracted.url !== undefined) result.url = extracted.url;
			return result;
		} catch (err) {
			return degrade(err, driver.kind);
		}
	}

	async function screenshot(url?: string): Promise<ScreenshotResult> {
		const target = url === undefined ? undefined : normalizeUrl(url);
		if (url !== undefined && !target) {
			return { status: "error", driver: driver.kind, reason: "url is required" };
		}
		try {
			const shot = await driver.screenshot(target);
			const result: ScreenshotResult = { status: "ok", driver: driver.kind };
			if (shot.imageBase64 !== undefined) result.imageBase64 = shot.imageBase64;
			if (shot.url !== undefined) result.url = shot.url;
			return result;
		} catch (err) {
			return degrade(err, driver.kind);
		}
	}

	return { navigate, extractText, screenshot };
}

/**
 * Map a thrown value to a truthful degraded result: a not-configured signal
 * becomes `not_configured`; anything else becomes `error`. Shared shape works for
 * all three ops (extra fields are simply absent).
 */
function degrade(
	err: unknown,
	driverKind: string,
): NavigateResult & ExtractResult & ScreenshotResult {
	return {
		status: isNotConfigured(err) ? "not_configured" : "error",
		driver: driverKind,
		reason: errorMessage(err),
	};
}

/** Trim + validate a URL string; returns undefined for empty/non-string input. */
function normalizeUrl(url: unknown): string | undefined {
	return typeof url === "string" && url.trim().length > 0 ? url.trim() : undefined;
}
