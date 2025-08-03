import { Package } from "../../shared/package"

export const DEFAULT_HEADERS = {
	"HTTP-Referer": "https://recoder.xyz",
	"X-Title": "Recoder",
	"X-Recoder-Version": Package.version,
	"User-Agent": `Recoder/${Package.version}`,
}
