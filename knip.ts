import type { KnipConfig } from "knip";

const config: KnipConfig = {
	biome: false,
	workspaces: {
		"apps/playground": {
			ignoreDependencies: [
				"@aws-sdk/client-s3",
				"@supabase/realtime-js",
				"@supabase/supabase-js",
				"happy-dom",
				"jsdom",
				"pg",
			],
		},
		"apps/ui.giselles.ai": {
			ignoreDependencies: ["tailwindcss"],
		},
		"internal-packages/ui": {
			ignoreDependencies: ["tailwindcss"],
		},
		"internal-packages/workflow-designer-ui": {
			ignoreDependencies: ["tailwindcss"],
			ignore: [
				// Not currently used in the product, but kept as a reference implementation for future use
				"src/editor/properties-panel/content-generation-node-properties-panel/**/*",
				// Will be used in the future
				"src/editor/properties-panel/app-entry-node-properties-panel/app-icon-select.tsx",
			],
		},
		"packages/rag": {
			ignore: ["src/chunker/__fixtures__/code-sample.ts"],
		},
	},
	ignore: ["turbo/generators/config.ts", ".github/**"],
	ignoreBinaries: ["vercel"],
};

export default config;
