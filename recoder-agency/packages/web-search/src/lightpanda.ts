import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

export const lightpandaProviderName = "lightpanda" as const;

const LIGHTPANDA_BIN =
	process.env.LIGHTPANDA_BIN ?? "/usr/local/bin/lightpanda";

/** Returns true if the lightpanda binary exists and is executable. */
export function isLightpandaAvailable(): boolean {
	try {
		return existsSync(LIGHTPANDA_BIN);
	} catch {
		return false;
	}
}

type ScrapeResult = {
	url: string;
	title: string;
	html: string;
	markdown: string;
};

/**
 * Scrape a URL using the Lightpanda headless browser.
 * Renders JavaScript, waits for network idle, and returns the page content.
 * Falls back to a plain-text empty result on error rather than throwing.
 */
export async function scrapeWithLightpanda(
	url: string,
	formats: ("html" | "markdown")[] = ["markdown"],
	timeoutMs = 15000,
): Promise<ScrapeResult> {
	const wantMarkdown = formats.includes("markdown");
	const wantHtml = formats.includes("html");
	const dumpFormat = wantHtml ? "html" : "markdown";

	const cmd = [
		LIGHTPANDA_BIN,
		"fetch",
		"--dump",
		dumpFormat,
		"--strip-mode",
		"ui",
		"--wait-ms",
		"3000",
		"--wait-until",
		"networkidle",
		`"${url}"`,
		"2>/dev/null",
	].join(" ");

	const raw = execSync(cmd, {
		timeout: timeoutMs,
		maxBuffer: 5 * 1024 * 1024,
		encoding: "utf-8",
	}).trim();

	// Extract a best-effort title
	const titleMatch = raw.match(/<title>([\s\S]*?)<\/title>/i);
	const title = titleMatch
		? titleMatch[1].trim()
		: (url.split("/").pop() ?? "Untitled");

	if (wantHtml && !wantMarkdown) {
		return { url, title, html: raw, markdown: "" };
	}

	if (wantMarkdown && !wantHtml) {
		// lightpanda --dump markdown returns markdown directly
		if (dumpFormat === "markdown") {
			return { url, title, html: "", markdown: raw };
		}
		// If we fetched html but need markdown, convert
		const Defuddle = (await import("defuddle/node")).Defuddle;
		const result = await Defuddle(raw, url, { markdown: true });
		return { url, title, html: "", markdown: result.content };
	}

	// Both formats wanted: fetch html, then derive markdown
	const htmlOutput = raw;
	const Defuddle = (await import("defuddle/node")).Defuddle;
	const mdResult = await Defuddle(htmlOutput, url, { markdown: true });
	return {
		url,
		title,
		html: htmlOutput,
		markdown: mdResult.content,
	};
}
