import { defineConfig } from "vitest/config";

// Only the owned foundation tests under src/ run. The raw-extracted
// gateway-core/, social-gateways/, and agents/ test suites import un-extracted
// monorepo modules and are reference source for the per-channel adapter phase,
// not part of the foundation's verification surface.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["gateway-core/**", "social-gateways/**", "agents/**", "node_modules/**"],
  },
});
