#!/usr/bin/env node
/**
 * Warning-level color guard (non-blocking by default)
 * - Runs report-colors and prints GitHub Actions warnings for raw color usages
 * - Excludes known safe files (e.g., tokens.css)
 * - Optional baseline comparison: detect increases vs a previous JSON
 *   Usage: node scripts/guard-colors.mjs [--baseline .reports/report-colors.json] [--strict]
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** @param {string} p */
function isExcluded(p) {
	// tokens/primitives, vendor assets, build outputs
	const exclude = [
		"/internal-packages/ui/styles/tokens.css",
		"/node_modules/",
		"/.next/",
		"/dist/",
		"/build/",
		"/out/",
		"/coverage/",
	];
	return exclude.some((mark) => p.includes(mark));
}

function parseArgs(argv) {
	const args = { baseline: undefined, strict: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--baseline") {
			if (i + 1 >= argv.length) {
				console.error("[guard-colors] --baseline requires a path argument");
				process.exit(1);
			}
			args.baseline = argv[++i];
		}
		if (a === "--strict") args.strict = true;
	}
	return args;
}

function main() {
	const { baseline, strict } = parseArgs(process.argv.slice(2));
	const res = spawnSync("node", ["scripts/report-colors.mjs"], {
		encoding: "utf8",
	});
	if (res.status !== 0) {
		console.error("[guard-colors] report-colors failed");
		process.exit(0); // non-blocking
	}
	let report;
	try {
		report = JSON.parse(res.stdout || "{}");
	} catch (_e) {
		console.error("[guard-colors] failed to parse report JSON");
		process.exit(0);
	}

	const findings = [];
	for (const item of report.findings?.hexColors || []) {
		if (!isExcluded(item.path)) findings.push(item);
	}
	for (const item of report.findings?.functionalColors || []) {
		if (!isExcluded(item.path)) findings.push(item);
	}

	// Baseline comparison (optional)
	let increased = 0;
	if (baseline) {
		try {
			const base = JSON.parse(readFileSync(baseline, "utf8"));
			const baseCount =
				(base.findings?.hexColors?.length || 0) +
				(base.findings?.functionalColors?.length || 0);
			const currCount = findings.length;
			if (currCount > baseCount) {
				increased = currCount - baseCount;
				console.log(
					`[guard-colors] Increase detected: +${increased} (baseline=${baseCount} -> current=${currCount})`,
				);
			}
		} catch (e) {
			console.error(
				`[guard-colors] failed to read baseline: ${e?.message || e}`,
			);
		}
	}

	if (findings.length === 0) {
		console.log("[guard-colors] No raw color findings");
		return;
	}

	// Print as GitHub Actions warnings
	for (const f of findings) {
		const msg =
			"Avoid raw colors. Prefer tokens/semantic utilities (e.g., text-text, text-inverse).";
		// ::warning file=...,line=...::message
		console.log(`::warning file=${f.path},line=${f.line}::${msg}`);
	}

	console.log(`[guard-colors] Total warnings: ${findings.length}`);

	// STRICT mode: fail build on increase (opt-in)
	if (strict && increased > 0) {
		console.error("[guard-colors] STRICT mode: failing due to increase");
		process.exit(1);
	}
}

main();
