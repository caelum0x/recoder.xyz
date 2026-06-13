#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const COMPAT_TOKENS = [
	"--color-white-900",
	"--color-black-600",
	"--color-black-850",
	"--color-white-850",
];

function run(pattern) {
	const args = [
		"-n",
		"--hidden",
		"--glob",
		"!**/node_modules/**",
		"--glob",
		"!**/.next/**",
		"--glob",
		"!**/dist/**",
		"--glob",
		"!**/build/**",
		"--glob",
		"!**/out/**",
		"--glob",
		"!**/coverage/**",
		"-e",
		pattern,
		".",
	];
	return spawnSync("rg", args, { encoding: "utf8" });
}

const excludePath = "/internal-packages/ui/styles/tokens.css";
let total = 0;
for (const t of COMPAT_TOKENS) {
	const res = run(t);
	if (res.status !== 0 && res.status !== 1) {
		console.error(res.stderr || res.stdout || "rg failed");
		process.exit(1);
	}
	const lines = String(res.stdout || "")
		.split("\n")
		.filter(Boolean);
	const filtered = lines.filter((l) => !l.includes(excludePath));
	if (filtered.length > 0) {
		total += filtered.length;
		console.log(`\nToken: ${t}`);
		for (const ln of filtered.slice(0, 200)) console.log(" ", ln);
		if (filtered.length > 200)
			console.log(` ... and ${filtered.length - 200} more`);
	}
}

console.log(`\nCompat tokens references (excluding tokens.css): ${total}`);
process.exit(0);
