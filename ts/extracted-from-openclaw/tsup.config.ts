import { defineConfig } from "tsup";

// @recoder/connectors build.
//
// Entry 1 — the FOUNDATION (`src/index.ts`): the ConnectorPort contract, domain
// types, the gating trust boundary, the embedded pi-agent runner, and the
// dispatch pipeline. Imports none of the channel/model SDKs statically (the
// embedded runner + slack adapter load their optional peers via dynamic import),
// so the foundation bundle stays free of the heavy SDK graph and install is
// ENOSPC-safe.
//
// Entries 2..n — the TYPECHECK-CLEAN per-channel adapters, each shipped as its
// own subpath (`@recoder/connectors/telegram`, `/slack`, `/signal`, `/imessage`,
// `/whatsapp`). They are separate entry points (not folded into the foundation)
// so a consumer only pulls an adapter — and its optional channel SDK — when they
// import that subpath. The known-broken discord adapter (139 type errors) and
// the not-yet-extracted line/feishu adapters are intentionally NOT entries.
//
// The raw-extracted gateway-core/, the rest of social-gateways/, and agents/ are
// reference source and are NOT entry points.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    telegram: "social-gateways/telegram/connector/index.ts",
    slack: "social-gateways/slack/adapter/index.ts",
    signal: "social-gateways/signal/adapter/index.ts",
    imessage: "social-gateways/imessage/adapter/index.ts",
    whatsapp: "social-gateways/whatsapp/adapter/index.ts",
  },
  format: ["esm", "cjs"],
  // The package ships multiple entry roots (foundation + 5 adapters); declaration
  // emit uses the multi-root build tsconfig instead of the rootDir=src package
  // tsconfig. See tsconfig.build.json for why this is a real build config, not a
  // type-error escape hatch.
  dts: { tsconfig: "./tsconfig.build.json" },
  tsconfig: "./tsconfig.build.json",
  sourcemap: true,
  clean: true,
  target: "es2022",
  // Share the foundation across adapter chunks instead of inlining a full copy
  // into each (ESM splitting; CJS falls back to per-entry bundling).
  splitting: true,
});
