import type { RecoderWebSearchTool } from "@recoder/language-model-registry";
import { searchWithSearXNG, selfMadeScrapeUrl } from "@recoder/web-search";
import { type ToolSet, tool } from "ai";
import * as z from "zod/v4";
import type { GiselleContext } from "../../../types";

export function createRecoderWebSearchTools({
	toolDefs,
	useTools,
	maxResults,
	context,
}: {
	toolDefs: readonly RecoderWebSearchTool[];
	useTools: string[];
	maxResults?: number;
	context: GiselleContext;
}): ToolSet {
	const toolSet: ToolSet = {};

	for (const toolDef of toolDefs) {
		if (!useTools.includes(toolDef.name)) {
			continue;
		}

		switch (toolDef.name) {
			case "search":
				toolSet.recoder_search = tool({
					description:
						"Search the web using SearXNG. Returns titles, URLs, and short snippets sorted by relevance.",
					inputSchema: z.object({
						query: z
							.string()
							.min(1)
							.max(500)
							.describe("The search query"),
					}),
					execute: async ({ query }) => {
						context.logger.debug(
							`[recoder-web-search] searching: ${query}`,
						);
						const results = await searchWithSearXNG(query, {
							maxResults: maxResults ?? 5,
						});
						return results.map((r) => ({
							title: r.title,
							url: r.url,
							snippet: r.content,
							publishedDate: r.publishedDate ?? null,
						}));
					},
				});
				break;

			case "fetchUrl":
				toolSet.recoder_fetchUrl = tool({
					description:
						"Fetch and return the full Markdown content of a web page. Uses a headless browser when available for JavaScript-rendered pages.",
					inputSchema: z.object({
						url: z.string().describe("The URL to fetch"),
					}),
					execute: async ({ url }) => {
						context.logger.debug(
							`[recoder-web-search] fetching url: ${url}`,
						);
						const result = await selfMadeScrapeUrl(url, ["markdown"]);
						return {
							title: result.title,
							markdown: result.markdown,
						};
					},
				});
				break;

			default: {
				const _exhaustiveCheck: never = toolDef;
				throw new Error(`Unknown recoder-web-search tool: ${_exhaustiveCheck}`);
			}
		}
	}

	return toolSet;
}
