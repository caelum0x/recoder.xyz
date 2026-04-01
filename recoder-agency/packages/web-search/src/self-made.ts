import { z } from "zod";
import { isLightpandaAvailable, scrapeWithLightpanda } from "./lightpanda";

export const selfMadeProviderName = "self-made" as const;

export const SelfMadeWebSearchProvider = z.object({
	provider: z.literal(selfMadeProviderName),
});

export type SelfMadeWebSearchProvider = z.infer<
	typeof SelfMadeWebSearchProvider
>;

type SelfMadeScrapeResult = {
	url: string;
	title: string;
	html: string;
	markdown: string;
};

/**
 * Scrapes the content of a given URL and returns the result in the specified formats.
 *
 * Uses Lightpanda headless browser when available (renders JavaScript, handles SPAs).
 * Falls back to plain HTTP fetch for static pages or when Lightpanda is not installed.
 *
 * @param {string} url - The URL to scrape. Must be a valid URL.
 * @param {("html" | "markdown")[]} [formats=["html"]] - Output formats to include.
 * @returns {Promise<SelfMadeScrapeResult>} Scraped content with URL, title, HTML, and/or Markdown.
 * @throws {Error} If the URL is invalid or the fetch operation fails.
 */
export async function scrapeUrl(
	url: string,
	formats: ("html" | "markdown")[] = ["html"],
): Promise<SelfMadeScrapeResult> {
	try {
		new URL(url);
	} catch {
		throw new Error(`Invalid URL: ${url}`);
	}

	// Prefer Lightpanda for JS-rendered pages when available on this server.
	if (isLightpandaAvailable()) {
		try {
			return await scrapeWithLightpanda(url, formats);
		} catch {
			// Lightpanda failed — fall through to plain fetch
		}
	}

	const res = await fetch(url, {
		headers: {
			"User-Agent":
				"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Recoder-User/1.0; +support@recoder.xyz)",
		},
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
	}
	const content = await res.text();
	const contentType = res.headers.get("content-type") ?? "";

	// Check if the content is already plain text/markdown
	const normalizedUrl = url.toLowerCase();
	const isPlainText =
		contentType.includes("text/plain") ||
		contentType.includes("text/markdown") ||
		contentType.includes("text/x-markdown") ||
		contentType.includes("application/markdown") ||
		normalizedUrl.endsWith(".txt") ||
		normalizedUrl.endsWith(".md") ||
		!content.trim().startsWith("<");

	// Extract title from HTML (only if it's HTML content)
	const match = content.match(/<title>([\s\S]*?)<\/title>/i);
	const title = match ? match[1].trim() : (url.split("/").pop() ?? "Untitled");

	let markdown = "";
	if (formats.includes("markdown")) {
		if (isPlainText) {
			markdown = content;
		} else {
			const Defuddle = (await import("defuddle/node")).Defuddle;
			const result = await Defuddle(content, url, { markdown: true });
			markdown = result.content;
		}
	}

	return {
		url,
		title,
		html: formats.includes("html") ? content : "",
		markdown: formats.includes("markdown") ? markdown : "",
	};
}
