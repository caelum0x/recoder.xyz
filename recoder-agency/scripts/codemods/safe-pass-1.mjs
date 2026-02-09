// scripts/codemods/safe-pass-1.mjs

import fs from "node:fs";
import path from "node:path";

// Minimal scaffold: dry-run reporting for a few safe mappings
// - text-black-600/20 -> text-text/20
// - color-border-focused -> ring-focused (heuristic placeholder)
// - text-white-900 -> text-text-inverse (skipped; requires context)

const ROOT = process.cwd();
const DRY_RUN = !process.argv.includes("--apply");

const FILE_EXTENSIONS = [".tsx", ".ts", ".css", ".svg"];

const REPLACERS = [
	{
		name: "text-black-600/20 => text-text/20",
		// Safe regex: capture optional variant prefixes (e.g., "hover:md:") without nested quantifiers
		// Boundary group (space or quote) preserved to avoid consuming surrounding content
		regex: /([\s"'`])((?:[A-Za-z0-9-]+:)*)text-black-600\/20(?=([\s"'`]|$))/g,
		replace: (_, boundary, variants) => `${boundary}${variants}text-text/20`,
	},
	{
		name: "color-border-focused => ring-focused (no context)",
		// Safe regex mirroring the structure above
		regex: /([\s"'`])((?:[A-Za-z0-9-]+:)*)color-border-focused(?=([\s"'`]|$))/g,
		replace: (_, boundary, variants) => `${boundary}${variants}ring-focused`,
	},
];

function walk(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const e of entries) {
		if (e.name === "node_modules" || e.name.startsWith(".")) continue;
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p);
		else if (FILE_EXTENSIONS.some((ext) => p.endsWith(ext))) processFile(p);
	}
}

let changes = 0;
let filesChanged = 0;

function processFile(file) {
	const src = fs.readFileSync(file, "utf8");
	let out = src;
	let localChanges = 0;
	for (const r of REPLACERS) {
		out = out.replace(r.regex, (match, boundary, variants) => {
			localChanges += 1;
			return r.replace(match, boundary, variants);
		});
	}
	if (localChanges > 0) {
		filesChanged += 1;
		changes += localChanges;
		if (!DRY_RUN) fs.writeFileSync(file, out);
		console.log(
			`${DRY_RUN ? "[dry]" : "[write]"} ${file}: ${localChanges} changes`,
		);
	}
}

walk(ROOT);
console.log(
	`\nSafe-pass-1 ${DRY_RUN ? "dry-run" : "apply"} complete: ${filesChanged} files, ${changes} changes`,
);
