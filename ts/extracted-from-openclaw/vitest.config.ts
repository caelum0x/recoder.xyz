import { defineConfig } from "vitest/config";

// Two verification surfaces run:
//
//  1. The owned FOUNDATION tests under src/ — the ConnectorPort contract, the
//     gating trust boundary, the embedded runner, and the dispatch pipeline.
//
//  2. The owned per-channel END-TO-END DISPATCH tests under
//     social-gateways/_dispatch/ — these drive the REAL per-channel adapters
//     (real normalize + real send) through the REAL registry + dispatchInbound +
//     gate, doubling ONLY each channel's true SDK seam (its `fetch` or injected
//     SDK client). They are the genuine "the 7 adapters are live end-to-end"
//     proof and import the adapter subtrees directly.
//
// The raw-extracted gateway-core/, the rest of social-gateways/*, and agents/
// suites import un-extracted monorepo modules and remain reference source,
// excluded from the verification surface.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "social-gateways/_dispatch/**/*.test.ts"],
    exclude: [
      "gateway-core/**",
      "agents/**",
      "node_modules/**",
      // Exclude every raw-extracted social-gateways test EXCEPT the owned
      // _dispatch end-to-end suite (which is included above).
      "social-gateways/discord/**",
      "social-gateways/telegram/**/*.test.ts",
      "social-gateways/slack/**/*.test.ts",
      "social-gateways/signal/**/*.test.ts",
      "social-gateways/imessage/**/*.test.ts",
      "social-gateways/whatsapp/**/*.test.ts",
      "social-gateways/line/**/*.test.ts",
      "social-gateways/feishu/**/*.test.ts",
    ],
  },
});
