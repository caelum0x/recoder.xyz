#!/usr/bin/env node
/**
 * Non-blocking code color guard for TS/TSX.
 * - Warns on literal colors in code (hex, rgb/rgba, hsl/hsla, oklch)
 * - Warns on Tailwind direct black/white color scales inside class strings (bg-*, border-*, text-*)
 * - Output is human-readable; exits with code 0 (intended as CI warning only)
 */

import { spawnSync } from "node:child_process";

function hasRg() {
	try {
		const res = spawnSync("rg", ["--version"], { encoding: "utf8" });
		if (res?.error) return false;
		if (res?.status !== 0) return false;
		return String(res.stdout || "").includes("ripgrep");
	} catch {
		return false;
	}
}

function runRg(pattern, globs) {
	const args = ["-n", "-i", "--hidden", "--json"];
	// Include only TS/TSX by default
	const include = globs?.include ?? ["**/*.ts", "**/*.tsx"];
	const exclude = globs?.exclude ?? [
		"!**/node_modules/**",
		"!**/.next/**",
		"!**/dist/**",
		"!**/build/**",
		"!**/out/**",
		"!**/coverage/**",
	];
	for (const g of exclude) args.push("--glob", g);
	for (const g of include) args.push("--glob", g);
	args.push("-e", pattern);
	const res = spawnSync("rg", args, { encoding: "utf8" });
	if (res?.error) {
		return { items: [], error: res.error.message || "rg failed to spawn" };
	}
	if (res.status !== 0 && res.status !== 1) {
		return { items: [], error: res.stderr || "rg failed" };
	}
	const items = [];
	for (const line of String(res.stdout || "").split("\n")) {
		if (!line.trim()) continue;
		let ev;
		try {
			ev = JSON.parse(line);
		} catch {
			continue;
		}
		if (ev?.type !== "match") continue;
		const m = ev.data;
		if (!m?.path?.text || !m?.lines?.text) continue;
		items.push({
			path: m.path.text,
			line: m.line_number,
			text: m.lines.text.trim(),
		});
	}
	return { items };
}

function print(section, results) {
	const items = results.items || [];
	if (items.length === 0) return;
	const cap = 20;
	console.log(`\n[lint:colors:code] ${section}: ${items.length} findings`);
	for (const it of items.slice(0, cap)) {
		const original = String(it.text || "");
		const preview = original.slice(0, 200);
		const isTruncated = original.length > 200;
		console.log(
			` - ${it.path}:${it.line}: ${preview}${isTruncated ? "..." : ""}`,
		);
	}
	if (items.length > cap) {
		console.log(`   ... and ${items.length - cap} more`);
	}
}

(function main() {
	if (!hasRg()) {
		console.log("[lint:colors:code] ripgrep not found; skipping.");
		process.exit(0);
	}

	// Aggregate checks with robust handling
	const checks = [
		{
			name: "hex colors in TS/TSX",
			// Ensure the next char is not another hex digit to avoid partial matches
			// Matches #RGB/#RGBA/#RRGGBB/#RRGGBBAA
			result: runRg(
				"#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-fA-F])",
			),
		},
		{
			name: "functional colors in TS/TSX (rgb/rgba/hsl/hsla/oklch)",
			result: runRg("\\b(?:rgba?|hsla?|oklch)\\s*\\("),
		},
		{
			name: "Tailwind direct black/white scales in class strings",
			// drop leading word boundary so classes embedded in hyphenated strings still match
			// keep boundary after the color token to avoid matching text-black-alpha-500
			result: runRg(
				"(?:text|bg|border)-(?:black|white)\\b(?:-[0-9]{1,3})?(?:\\/[0-9]{1,3})?",
			),
		},
	];

	let total = 0;
	for (const { name, result } of checks) {
		if (result.error) {
			console.error(
				`\n[lint:colors:code] Error checking for ${name}: ${result.error}`,
			);
			continue;
		}
		print(name, result);
		total += result.items?.length || 0;
	}
	if (total === 0) {
		console.log("[lint:colors:code] No issues found.");
	} else {
		console.log(
			`\n[lint:colors:code] Summary: ${total} findings. (non-blocking)`,
		);
	}
	// Always exit 0: warn-only
	process.exit(0);
})();
