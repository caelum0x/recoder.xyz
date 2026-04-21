import fs from "node:fs";
import path from "node:path";

const appRoot = process.cwd();
const srcStatic = path.join(appRoot, ".next", "static");
const srcServer = path.join(appRoot, ".next", "server");
const destStatic = path.join(
	appRoot,
	".next",
	"standalone",
	"apps",
	"agency",
	".next",
	"static",
);
const destServer = path.join(
	appRoot,
	".next",
	"standalone",
	"apps",
	"agency",
	".next",
	"server",
);
const rootAuthClient = path.join(
	appRoot,
	"..",
	"..",
	"..",
	"packages",
	"auth",
	"prisma",
	"auth-client",
);
const standaloneAuthClient = path.join(
	appRoot,
	".next",
	"standalone",
	"apps",
	"agency",
	"prisma",
	"auth-client",
);

if (!fs.existsSync(srcStatic)) {
	console.error(`[prepare-standalone-assets] Missing source: ${srcStatic}`);
	process.exit(1);
}

fs.rmSync(destStatic, { recursive: true, force: true });
fs.mkdirSync(path.dirname(destStatic), { recursive: true });
fs.cpSync(srcStatic, destStatic, { recursive: true });

if (fs.existsSync(srcServer)) {
	fs.mkdirSync(destServer, { recursive: true });
	const requiredServerFiles = [
		"middleware-manifest.json",
	];
	for (const file of requiredServerFiles) {
		const src = path.join(srcServer, file);
		const dest = path.join(destServer, file);
		if (fs.existsSync(src)) {
			fs.cpSync(src, dest, { force: true });
		}
	}
}

if (fs.existsSync(rootAuthClient)) {
	fs.rmSync(standaloneAuthClient, { recursive: true, force: true });
	fs.mkdirSync(path.dirname(standaloneAuthClient), { recursive: true });
	fs.cpSync(rootAuthClient, standaloneAuthClient, { recursive: true });
}

console.log(
	"[prepare-standalone-assets] Copied standalone runtime assets (.next/static, required server manifests, prisma auth-client).",
);
