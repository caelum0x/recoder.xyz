const SEARXNG_BASE_URL =
	process.env.SEARXNG_BASE_URL ?? "http://127.0.0.1:8888";

export type SearXNGResult = {
	url: string;
	title: string;
	content: string;
	publishedDate?: string;
	engines: string[];
	score: number;
};

type SearXNGSearchResponse = {
	query: string;
	number_of_results: number;
	results: SearXNGResult[];
	answers: string[];
	suggestions: string[];
};

/**
 * Search the web using the local SearXNG instance.
 *
 * Requires SearXNG running at SEARXNG_BASE_URL (default http://127.0.0.1:8888).
 * Returns at most `maxResults` results sorted by relevance score.
 */
export async function searchWithSearXNG(
	query: string,
	options: { maxResults?: number; language?: string } = {},
): Promise<SearXNGResult[]> {
	const { maxResults = 10, language } = options;

	const url = new URL("/search", SEARXNG_BASE_URL);
	url.searchParams.set("q", query);
	url.searchParams.set("format", "json");
	if (language) {
		url.searchParams.set("language", language);
	}

	const res = await fetch(url.toString(), {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(15_000),
	});

	if (!res.ok) {
		throw new Error(
			`SearXNG search failed: ${res.status} ${res.statusText}`,
		);
	}

	const data = (await res.json()) as SearXNGSearchResponse;
	return data.results.slice(0, maxResults);
}
