/**
 * @recoder/agent-browser — the owned Browser engine (RECODER-ENGINES E9
 * browser-use). navigate → extract text → screenshot over an INJECTED driver
 * (puppeteer, lazily imported; or a browser-use HTTP service), with every path
 * degrade-safe: no driver wired ⇒ truthful `not_configured`, never a throw, never
 * a fabricated page.
 */
export {
	BrowserNotConfiguredError,
	errorMessage,
	isNotConfigured,
	type BrowserDriver,
	type BrowserEngine,
	type BrowserStatus,
	type DriverExtraction,
	type DriverNavigation,
	type DriverScreenshot,
	type ExtractResult,
	type NavigateResult,
	type ScreenshotResult,
} from "./browser-port.js";
export {
	createBrowserEngine,
	type BrowserEngineDeps,
} from "./browser-engine.js";
export {
	createDefaultBrowserDriver,
	createHttpBrowserDriver,
	createPuppeteerBrowserDriver,
	type BrowserEnv,
	type BrowserFetch,
	type BrowserHttpResponse,
	type DefaultBrowserDriverOptions,
	type HttpBrowserDriverOptions,
	type PuppeteerDriverOptions,
} from "./driver.js";
