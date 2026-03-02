import fs from "node:fs";
import path from "node:path";

const appRoot = process.cwd();
const srcStatic = path.join(appRoot, ".next", "static");
const destStatic = path.join(
	appRoot,
	".next",
	"standalone",
	"apps",
	"agency",
	".next",
	"static",
);

if (!fs.existsSync(srcStatic)) {
	console.error(`[prepare-standalone-assets] Missing source: ${srcStatic}`);
	process.exit(1);
}

fs.rmSync(destStatic, { recursive: true, force: true });
fs.mkdirSync(path.dirname(destStatic), { recursive: true });
fs.cpSync(srcStatic, destStatic, { recursive: true });

console.log("[prepare-standalone-assets] Copied .next/static into standalone runtime.");
