import { existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

const required = [
  "packages/backend/ai-insights.ts",
  "packages/backend/opportunity-scoring.ts",
  "packages/backend/proposal-generator.ts",
  "packages/backend/contradiction-detector.ts",
  "packages/backend/prd-generator.ts",
  "packages/backend/task-decomposer.ts",
  "apps/api/app/cron/ai-insights/route.ts",
  "apps/api/app/cron/opportunity-scoring/route.ts",
  "apps/api/app/cron/proposals/route.ts",
  "apps/api/app/cron/contradictions/route.ts",
  "apps/app/app/(organization)/proposals/page.tsx",
  "apps/app/app/(organization)/proposals/[proposal]/prd/page.tsx",
  "apps/app/app/(organization)/proposals/[proposal]/spec/route.ts",
];

const missing = required.filter((file) => !existsSync(join(root, file)));

if (missing.length > 0) {
  console.error("Missing expected files:");
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exitCode = 1;
} else {
  console.log("Smoke check passed: key AI pipeline files present.");
}
