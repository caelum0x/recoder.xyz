import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: false,
  sourcemap: true,
  clean: true,
  external: ["@anthropic-ai/sdk", "@aws-sdk/client-bedrock-runtime", "@smithy/node-http-handler", "@google/genai", "@mistralai/mistralai", "http-proxy-agent", "https-proxy-agent", "openai", "partial-json", "typebox"],
});
