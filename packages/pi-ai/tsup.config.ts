import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts", "src/compat.ts", "src/oauth.ts", "src/bedrock-provider.ts"],
  format: ["cjs", "esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["@anthropic-ai/sdk", "@aws-sdk/client-bedrock-runtime", "@smithy/node-http-handler", "@google/genai", "@mistralai/mistralai", "@opentelemetry/api", "http-proxy-agent", "https-proxy-agent", "openai", "partial-json", "typebox"],
});
