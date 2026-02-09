import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: ["src/react/index.ts"],
		format: ["cjs", "esm"],
		dts: true,
		outDir: "react/dist",
		sourcemap: true,
		clean: true,
	},
]);
