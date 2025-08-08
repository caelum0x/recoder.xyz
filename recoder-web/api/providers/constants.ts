// Import from the shared utilities which has the Package export
import { Package } from "../../lib/shared"

export const DEFAULT_HEADERS = {
	"HTTP-Referer": "https://recoder.xyz",
	"X-Title": "Recoder",
	"X-Recoder-Version": Package.version || "1.0.0",
	"User-Agent": `Recoder/${Package.version || "1.0.0"}`,
}
