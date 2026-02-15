import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: { index: "src/index.ts" },
		format: ["cjs", "esm"],
		dts: true,
		sourcemap: true,
	},
	{
		entry: { "node-crypto": "src/node-crypto.ts" },
		format: ["cjs", "esm"],
		dts: true,
		sourcemap: true,
	},
]);
