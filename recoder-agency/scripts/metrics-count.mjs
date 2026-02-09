#!/usr/bin/env node
/**
 * Simple metrics: count occurrences of selected patterns for migration tracking.
 * Usage: node scripts/metrics-count.mjs "text-white-900|bg-[a-z-]+-\d{2,3}"
 */

import { spawnSync } from "node:child_process";

const pattern = process.argv[2] || "text-white-900";
const res = spawnSync("rg", ["-n", "-i", "--hidden", pattern], {
	encoding: "utf8",
});
if (res.status !== 0 && res.status !== 1) {
	console.error(res.stderr || "rg failed");
	process.exit(1);
}
const lines = (res.stdout || "").trim().split("\n").filter(Boolean);
console.log(JSON.stringify({ pattern, count: lines.length }, null, 2));
