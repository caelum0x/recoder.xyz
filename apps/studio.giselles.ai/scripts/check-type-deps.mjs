#!/usr/bin/env node

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

const requiredModules = [
  "typescript",
  "next/server",
  "zod",
  "drizzle-orm",
  "@supabase/supabase-js",
];

const requiredWorkspacePackages = [
  "@giselles-ai/protocol",
  "@giselles-ai/giselle",
  "@giselles-ai/react",
  "@giselles-ai/rag",
];

const missing = [];
for (const mod of requiredModules) {
  try {
    require.resolve(mod);
  } catch {
    missing.push(mod);
  }
}

for (const pkg of requiredWorkspacePackages) {
  const pkgPath = path.join("node_modules", ...pkg.split("/"), "package.json");
  if (!existsSync(pkgPath)) {
    missing.push(pkg);
  }
}

if (!existsSync("./node_modules")) {
  missing.push("node_modules");
}

if (missing.length > 0) {
  console.error("Studio typecheck preflight failed: required dependencies are missing.");
  console.error("Missing modules/paths:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  console.error("");
  console.error("Run dependency install when network access to npm registry is available.");
  process.exit(10);
}

console.log("Studio typecheck preflight passed.");
