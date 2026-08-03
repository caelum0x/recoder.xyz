import path from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
	resolve: {
		alias: {
			// The npm "vscode" package has no resolvable entry; specs mock the
			// module with vi.mock("vscode", factory) but vitest still needs the
			// id to resolve. See src/test/vscode-stub.ts.
			vscode: path.resolve(__dirname, "src/test/vscode-stub.ts"),
		},
	},
	test: {
		globals: true,
		watch: false,
		include: ["src/**/__tests__/**/*.{spec,test}.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/**/__tests__/**"],
		},
	},
})
