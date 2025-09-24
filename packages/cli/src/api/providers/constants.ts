// Handle both development and production environments
let pkg: { version: string };
try {
	// Try importing from shared package
	const shared = require("recoder-shared");
	pkg = shared.pkg || shared.default?.pkg || { version: "1.0.0" };
} catch (error) {
	// Fallback for development mode
	console.warn('Failed to load package info from recoder-shared, using fallback');
	pkg = { version: "1.0.0" };
}

// Ensure pkg has a version property
if (!pkg || typeof pkg.version !== 'string') {
	pkg = { version: "1.0.0" };
}

export const DEFAULT_HEADERS = {
	"HTTP-Referer": "https://kilocode.ai",
	"X-Title": "Kilo Code",
	"X-KiloCode-Version": pkg.version,
	"User-Agent": `Kilo-Code/${pkg.version}`,
}
