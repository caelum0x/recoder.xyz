import * as z from "zod/v4";
import { defineLanguageModelTool, defineTool } from "./tool";

const recoderWebSearchTools = [
	defineTool({
		name: "search",
		title: "Search",
		description:
			"Search the web for information. Returns a list of results with titles, URLs, and snippets.",
	}),
	defineTool({
		name: "fetchUrl",
		title: "Fetch URL",
		description:
			"Fetch the full content of a web page and return it as Markdown.",
	}),
] as const;

export type RecoderWebSearchTool = (typeof recoderWebSearchTools)[number];

export const recoderWebSearch = defineLanguageModelTool({
	name: "recoder-web-search",
	title: "Recoder Web Search",
	provider: "giselle",
	tools: recoderWebSearchTools,
	configurationOptions: {
		maxResults: {
			name: "maxResults",
			type: "enum",
			valueType: "number",
			title: "Max Results",
			description: "Maximum number of search results to return per query",
			options: [
				{ value: "3", label: "3" },
				{ value: "5", label: "5" },
				{ value: "10", label: "10" },
			],
			optional: true,
			schema: z.number().optional(),
		},
		useTools: {
			name: "useTools",
			type: "toolSelection",
			title: "Use Tools",
		},
	},
});
