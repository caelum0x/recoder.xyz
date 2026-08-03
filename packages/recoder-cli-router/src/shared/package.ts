/**
 * Package identity used for outbound request headers.
 *
 * Mirrors the upstream (Kilo Code) generated `src/shared/package.ts` shape,
 * sourcing the version from this package's manifest.
 */

import { version } from "../../package.json"

export const Package = {
	publisher: "recoder",
	name: "recoder-cli-router",
	version,
} as const
