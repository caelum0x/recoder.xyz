import { defineConfig } from "vitest/config";

// Adapter-scoped Vitest config for the Feishu ConnectorPort adapter. The
// foundation's root vitest.config.ts excludes social-gateways/** (the raw
// extracted suites import un-extracted modules); this config runs ONLY the
// self-contained adapter test in this directory, which has no missing deps.
export default defineConfig({
  test: {
    include: ["./connector.test.ts"],
    root: __dirname,
  },
});
