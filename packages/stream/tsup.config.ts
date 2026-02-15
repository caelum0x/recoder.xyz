import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: { index: "src/index.ts" },
		format: ["cjs", "esm"],
		dts: true,
		sourcemap: true,
	},
	{
		entry: { "public-task-stream": "src/public-task-stream.ts" },
		format: ["cjs", "esm"],
		dts: true,
		sourcemap: true,
	},
]);
