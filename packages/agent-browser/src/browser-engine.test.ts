import { describe, expect, it } from "vitest";
import {
	createBrowserEngine,
	createDefaultBrowserDriver,
	createHttpBrowserDriver,
	createPuppeteerBrowserDriver,
} from "./index.js";
import {
	BrowserNotConfiguredError,
	type BrowserDriver,
	type BrowserFetch,
	type BrowserHttpResponse,
} from "./index.js";

/** A happy-path fake driver holding fixed page data. Touches nothing external. */
function fakeDriver(overrides: Partial<BrowserDriver> = {}): BrowserDriver {
	return {
		kind: "fake",
		async navigate(url) {
			return { url, title: `Title of ${url}`, httpStatus: 200 };
		},
		async extractText(url) {
			return { text: `text of ${url ?? "current"}`, url: url ?? "about:current" };
		},
		async screenshot(url) {
			return { imageBase64: "ZmFrZS1wbmc=", url: url ?? "about:current" };
		},
		...overrides,
	};
}

/** A driver whose every op signals "not wired". */
function notConfiguredDriver(): BrowserDriver {
	const boom = () => {
		throw new BrowserNotConfiguredError("puppeteer not installed");
	};
	return {
		kind: "none",
		navigate: boom,
		extractText: boom,
		screenshot: boom,
	};
}

/** A driver whose every op fails operationally (a real error, not a degrade). */
function throwingDriver(): BrowserDriver {
	const boom = () => {
		throw new Error("net::ERR_CONNECTION_REFUSED");
	};
	return { kind: "fake", navigate: boom, extractText: boom, screenshot: boom };
}

describe("createBrowserEngine — happy path (fake driver)", () => {
	it("navigate returns ok with url + title", async () => {
		const engine = createBrowserEngine({ driver: fakeDriver() });
		const res = await engine.navigate("https://example.com");
		expect(res.status).toBe("ok");
		expect(res.url).toBe("https://example.com");
		expect(res.title).toBe("Title of https://example.com");
		expect(res.httpStatus).toBe(200);
		expect(res.driver).toBe("fake");
	});

	it("navigate trims the url before driving", async () => {
		let seen = "";
		const engine = createBrowserEngine({
			driver: fakeDriver({
				async navigate(url) {
					seen = url;
					return { url, title: "t" };
				},
			}),
		});
		const res = await engine.navigate("  https://trim.me  ");
		expect(seen).toBe("https://trim.me");
		expect(res.status).toBe("ok");
	});

	it("extractText returns ok with text", async () => {
		const engine = createBrowserEngine({ driver: fakeDriver() });
		const res = await engine.extractText("https://example.com");
		expect(res.status).toBe("ok");
		expect(res.text).toBe("text of https://example.com");
	});

	it("extractText with no url extracts the current page", async () => {
		const engine = createBrowserEngine({ driver: fakeDriver() });
		const res = await engine.extractText();
		expect(res.status).toBe("ok");
		expect(res.text).toBe("text of current");
	});

	it("screenshot returns ok with base64 image", async () => {
		const engine = createBrowserEngine({ driver: fakeDriver() });
		const res = await engine.screenshot("https://example.com");
		expect(res.status).toBe("ok");
		expect(res.imageBase64).toBe("ZmFrZS1wbmc=");
	});
});

describe("createBrowserEngine — degrade & validation", () => {
	it("degrades to not_configured when the driver is not wired", async () => {
		const engine = createBrowserEngine({ driver: notConfiguredDriver() });
		const nav = await engine.navigate("https://example.com");
		expect(nav.status).toBe("not_configured");
		expect(nav.reason).toMatch(/puppeteer not installed/);

		const ext = await engine.extractText("https://example.com");
		expect(ext.status).toBe("not_configured");

		const shot = await engine.screenshot("https://example.com");
		expect(shot.status).toBe("not_configured");
	});

	it("maps an operational failure to error (not not_configured)", async () => {
		const engine = createBrowserEngine({ driver: throwingDriver() });
		const nav = await engine.navigate("https://example.com");
		expect(nav.status).toBe("error");
		expect(nav.reason).toMatch(/ERR_CONNECTION_REFUSED/);
	});

	it("never throws — rejects empty url with an error status", async () => {
		const engine = createBrowserEngine({ driver: fakeDriver() });
		const nav = await engine.navigate("   ");
		expect(nav.status).toBe("error");
		expect(nav.reason).toBe("url is required");
	});
});

describe("default puppeteer driver — degrade-safe with no puppeteer present", () => {
	it("engine returns not_configured when import('puppeteer') fails", async () => {
		const driver = createPuppeteerBrowserDriver({
			importPuppeteer: async () => {
				throw new Error("Cannot find module 'puppeteer'");
			},
		});
		const engine = createBrowserEngine({ driver });
		const res = await engine.navigate("https://example.com");
		expect(res.status).toBe("not_configured");
		expect(res.reason).toMatch(/puppeteer not installed/);
	});

	it("uses puppeteer when the injected module is present", async () => {
		const fakePuppeteer = {
			launch: async () => ({
				newPage: async () => ({
					goto: async () => ({ status: () => 200 }),
					title: async () => "Injected",
					url: () => "https://example.com/final",
					evaluate: async () => "body text",
					screenshot: async () => "aW1n",
				}),
				close: async () => undefined,
			}),
		};
		const driver = createPuppeteerBrowserDriver({
			importPuppeteer: async () => ({ default: fakePuppeteer }),
		});
		const engine = createBrowserEngine({ driver });
		const nav = await engine.navigate("https://example.com");
		expect(nav.status).toBe("ok");
		expect(nav.title).toBe("Injected");
		expect(nav.url).toBe("https://example.com/final");
		expect(nav.httpStatus).toBe(200);
	});
});

describe("http (browser-use) driver", () => {
	it("degrades to not_configured with no BROWSER_USE_URL", async () => {
		const driver = createHttpBrowserDriver({ env: {}, fetchImpl: (async () => {
			throw new Error("should not be called");
		}) as unknown as BrowserFetch });
		const engine = createBrowserEngine({ driver });
		const res = await engine.navigate("https://example.com");
		expect(res.status).toBe("not_configured");
		expect(res.reason).toMatch(/BROWSER_USE_URL/);
	});

	it("navigates via the injected fetch when a URL is configured", async () => {
		const calls: string[] = [];
		const fetchImpl: BrowserFetch = async (url) => {
			calls.push(url);
			const body: BrowserHttpResponse = {
				ok: true,
				status: 200,
				async json() {
					return { url: "https://example.com/x", title: "Served", httpStatus: 200 };
				},
			};
			return body;
		};
		const driver = createHttpBrowserDriver({
			url: "https://browseruse.local",
			fetchImpl,
		});
		const engine = createBrowserEngine({ driver });
		const res = await engine.navigate("https://example.com");
		expect(res.status).toBe("ok");
		expect(res.title).toBe("Served");
		expect(calls[0]).toBe("https://browseruse.local/navigate");
	});

	it("degrades to not_configured on a non-2xx service response", async () => {
		const fetchImpl: BrowserFetch = async () => ({
			ok: false,
			status: 503,
			async json() {
				return {};
			},
		});
		const driver = createHttpBrowserDriver({ url: "https://x.local", fetchImpl });
		const engine = createBrowserEngine({ driver });
		const res = await engine.extractText("https://example.com");
		expect(res.status).toBe("not_configured");
		expect(res.reason).toMatch(/HTTP 503/);
	});
});

describe("createDefaultBrowserDriver — composition root", () => {
	it("picks the http driver when BROWSER_USE_URL is set", () => {
		const driver = createDefaultBrowserDriver({
			env: { BROWSER_USE_URL: "https://x.local" },
		});
		expect(driver.kind).toBe("http");
	});

	it("falls back to the puppeteer driver when no URL is set", () => {
		const driver = createDefaultBrowserDriver({ env: {} });
		expect(driver.kind).toBe("puppeteer");
	});
});
