import pkg from "../../shared/package"

export const DEFAULT_HEADERS = {
	"HTTP-Referer": "https://kilocode.ai",
	"X-Title": "Kilo Code",
	"X-KiloCode-Version": pkg.version,
	"User-Agent": `Kilo-Code/${pkg.version}`,
}
