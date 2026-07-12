/**
 * driver — the two concrete {@link BrowserDriver} backends plus the composition
 * root that picks one from the environment.
 *
 *  - `createPuppeteerBrowserDriver`: LAZILY `import('puppeteer')` inside a
 *    try/catch. If puppeteer is absent (the default) or a launch fails, it throws
 *    {@link BrowserNotConfiguredError} → the engine degrades to `not_configured`.
 *    puppeteer is NEVER a hard dependency of this package.
 *  - `createHttpBrowserDriver`: POSTs to a `browser-use` HTTP service
 *    (`BROWSER_USE_URL`). No URL / no fetch ⇒ throws not-configured. Fetch is
 *    injectable so tests touch no network.
 *  - `createDefaultBrowserDriver`: HTTP driver when `BROWSER_USE_URL` is set,
 *    else the puppeteer driver. This is what the backend MCP skin composes over.
 */
import {
	BrowserNotConfiguredError,
	errorMessage,
	type BrowserDriver,
	type DriverExtraction,
	type DriverNavigation,
	type DriverScreenshot,
} from "./browser-port.js";

/** Minimal fetch shape so tests can supply a fake without a real Response. */
export interface BrowserHttpResponse {
	readonly ok: boolean;
	readonly status: number;
	json(): Promise<unknown>;
}
export type BrowserFetch = (
	url: string,
	init: {
		method: string;
		headers: Record<string, string>;
		body: string;
		signal?: AbortSignal;
	},
) => Promise<BrowserHttpResponse>;

/** Env subset the composition root reads. Defaults to `process.env`. */
export interface BrowserEnv {
	BROWSER_USE_URL?: string;
}

const DEFAULT_HTTP_TIMEOUT_MS = 15_000;

/**
 * The puppeteer module specifier, held as a (non-literal) string so the TypeScript
 * compiler does NOT statically resolve it — puppeteer is an OPTIONAL, runtime-only
 * driver that is absent by default. The import stays fully dynamic + degrade-safe.
 */
const PUPPETEER_SPECIFIER: string = "puppeteer";

// ---------------------------------------------------------------------------
// puppeteer driver (lazily dynamic-imported; degrade-safe when absent)
// ---------------------------------------------------------------------------

export interface PuppeteerDriverOptions {
	/**
	 * Injectable module loader (defaults to `import('puppeteer')`). Tests pass a
	 * fake to exercise both the "installed" and "absent" paths with no real
	 * puppeteer present.
	 */
	importPuppeteer?: () => Promise<unknown>;
	/** Extra `puppeteer.launch` options merged over the safe defaults. */
	launchOptions?: Record<string, unknown>;
	/** Navigation wait strategy. Default 'domcontentloaded'. */
	waitUntil?: string;
}

interface PuppeteerLikePage {
	goto(url: string, options?: unknown): Promise<{ status?: () => number } | null>;
	title(): Promise<string>;
	url(): string;
	evaluate(fn: () => string): Promise<string>;
	screenshot(options?: unknown): Promise<string | Uint8Array>;
}
interface PuppeteerLikeBrowser {
	newPage(): Promise<PuppeteerLikePage>;
	close(): Promise<void>;
}
interface PuppeteerLike {
	launch(options?: unknown): Promise<PuppeteerLikeBrowser>;
}

/**
 * puppeteer-backed driver. Each op launches → drives one page → closes (simple +
 * robust; no shared session to leak). puppeteer is imported lazily so this
 * package builds and runs with it absent.
 */
export function createPuppeteerBrowserDriver(
	options: PuppeteerDriverOptions = {},
): BrowserDriver {
	const doImport =
		options.importPuppeteer ??
		(() => import(PUPPETEER_SPECIFIER) as Promise<unknown>);
	const waitUntil = options.waitUntil ?? "domcontentloaded";

	async function withPage<T>(
		fn: (page: PuppeteerLikePage) => Promise<T>,
	): Promise<T> {
		let mod: unknown;
		try {
			mod = await doImport();
		} catch {
			throw new BrowserNotConfiguredError("puppeteer not installed");
		}
		const puppeteer = resolvePuppeteer(mod);
		if (!puppeteer) {
			throw new BrowserNotConfiguredError("puppeteer not installed");
		}
		let browser: PuppeteerLikeBrowser;
		try {
			browser = await puppeteer.launch({
				headless: true,
				args: ["--no-sandbox", "--disable-setuid-sandbox"],
				...(options.launchOptions ?? {}),
			});
		} catch (err) {
			throw new BrowserNotConfiguredError(
				`browser launch failed: ${errorMessage(err)}`,
			);
		}
		try {
			const page = await browser.newPage();
			return await fn(page);
		} finally {
			await browser.close().catch(() => undefined);
		}
	}

	return {
		kind: "puppeteer",
		navigate(url) {
			return withPage(async (page) => {
				const resp = await page.goto(url, { waitUntil });
				const nav: DriverNavigation = {
					url: page.url(),
					title: await page.title(),
				};
				const httpStatus = resp?.status?.();
				if (typeof httpStatus === "number") nav.httpStatus = httpStatus;
				return nav;
			});
		},
		extractText(url) {
			return withPage(async (page) => {
				if (url) await page.goto(url, { waitUntil });
				const text = await page.evaluate(
					() => document.body?.innerText ?? "",
				);
				const out: DriverExtraction = { text: text ?? "", url: page.url() };
				return out;
			});
		},
		screenshot(url) {
			return withPage(async (page) => {
				if (url) await page.goto(url, { waitUntil });
				const raw = await page.screenshot({ encoding: "base64", type: "png" });
				const out: DriverScreenshot = {
					imageBase64: typeof raw === "string" ? raw : undefined,
					url: page.url(),
				};
				return out;
			});
		},
	};
}

function resolvePuppeteer(mod: unknown): PuppeteerLike | null {
	if (!mod || typeof mod !== "object") return null;
	const candidate =
		(mod as { default?: unknown }).default && typeof (mod as { default?: unknown }).default === "object"
			? (mod as { default: unknown }).default
			: mod;
	return typeof (candidate as { launch?: unknown }).launch === "function"
		? (candidate as PuppeteerLike)
		: null;
}

// ---------------------------------------------------------------------------
// HTTP (browser-use service) driver
// ---------------------------------------------------------------------------

export interface HttpBrowserDriverOptions {
	/** browser-use base URL. Falls back to `BROWSER_USE_URL`. */
	url?: string;
	/** Injectable fetch. Defaults to the global `fetch`. */
	fetchImpl?: BrowserFetch;
	/** Env subset (defaults to `process.env`). */
	env?: BrowserEnv;
	/** Request timeout (ms). Default {@link DEFAULT_HTTP_TIMEOUT_MS}. */
	timeoutMs?: number;
}

/**
 * HTTP driver hitting a `browser-use` service. POSTs `{ url }` to
 * `<base>/navigate` | `/extract` | `/screenshot`. Throws not-configured when no
 * URL / fetch is available or on any non-2xx / malformed response — the engine
 * then degrades truthfully. Never fabricates a page result.
 */
export function createHttpBrowserDriver(
	options: HttpBrowserDriverOptions = {},
): BrowserDriver {
	const env = options.env ?? (readProcessEnv());
	const base = (options.url ?? env.BROWSER_USE_URL ?? "").replace(/\/+$/, "");
	const fetchImpl =
		options.fetchImpl ??
		(typeof fetch === "function" ? (fetch as unknown as BrowserFetch) : undefined);
	const timeoutMs = options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
	const configured = Boolean(base) && typeof fetchImpl === "function";

	async function post(path: string, url?: string): Promise<Record<string, unknown>> {
		if (!configured) {
			throw new BrowserNotConfiguredError(
				"browser-use HTTP service not configured (no BROWSER_USE_URL)",
			);
		}
		let res: BrowserHttpResponse;
		try {
			res = await (fetchImpl as BrowserFetch)(`${base}${path}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(url ? { url } : {}),
				signal: timeoutSignal(timeoutMs),
			});
		} catch (err) {
			throw new BrowserNotConfiguredError(
				`browser-use request failed: ${errorMessage(err)}`,
			);
		}
		if (!res.ok) {
			throw new BrowserNotConfiguredError(
				`browser-use service returned HTTP ${res.status}`,
			);
		}
		const body = await res.json().catch(() => null);
		if (!body || typeof body !== "object") {
			throw new BrowserNotConfiguredError("browser-use returned a malformed body");
		}
		return body as Record<string, unknown>;
	}

	return {
		kind: "http",
		async navigate(url) {
			const body = await post("/navigate", url);
			const nav: DriverNavigation = {
				url: readString(body.url) ?? url,
				title: readString(body.title),
			};
			const httpStatus = readNumber(body.httpStatus ?? body.status);
			if (httpStatus !== undefined) nav.httpStatus = httpStatus;
			return nav;
		},
		async extractText(url) {
			const body = await post("/extract", url);
			return { text: readString(body.text) ?? "", url: readString(body.url) ?? url };
		},
		async screenshot(url) {
			const body = await post("/screenshot", url);
			return {
				imageBase64: readString(body.imageBase64 ?? body.image),
				url: readString(body.url) ?? url,
			};
		},
	};
}

// ---------------------------------------------------------------------------
// composition root
// ---------------------------------------------------------------------------

export interface DefaultBrowserDriverOptions {
	env?: BrowserEnv;
	fetch?: BrowserFetch;
	importPuppeteer?: () => Promise<unknown>;
	launchOptions?: Record<string, unknown>;
}

/**
 * Pick the driver from the environment: the HTTP `browser-use` driver when
 * `BROWSER_USE_URL` is set, otherwise the lazily-imported puppeteer driver. Both
 * are degrade-safe — with neither wired, every engine op returns `not_configured`.
 */
export function createDefaultBrowserDriver(
	options: DefaultBrowserDriverOptions = {},
): BrowserDriver {
	const env = options.env ?? readProcessEnv();
	if (env.BROWSER_USE_URL && env.BROWSER_USE_URL.trim()) {
		return createHttpBrowserDriver({ env, fetchImpl: options.fetch });
	}
	return createPuppeteerBrowserDriver({
		importPuppeteer: options.importPuppeteer,
		launchOptions: options.launchOptions,
	});
}

function readProcessEnv(): BrowserEnv {
	if (typeof process !== "undefined" && process.env) {
		return { BROWSER_USE_URL: process.env.BROWSER_USE_URL };
	}
	return {};
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Best-effort abort signal; absent in some runtimes, so guard it. */
function timeoutSignal(ms: number): AbortSignal | undefined {
	try {
		const ctor = (AbortSignal as unknown as {
			timeout?: (n: number) => AbortSignal;
		}).timeout;
		return typeof ctor === "function" ? ctor(ms) : undefined;
	} catch {
		return undefined;
	}
}
