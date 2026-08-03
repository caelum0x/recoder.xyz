/**
 * VS Code LM model selector utilities (upstream Roo/Kilo Code semantics).
 */

export interface VsCodeLmModelSelector {
	vendor?: string
	family?: string
	version?: string
	id?: string
}

export const SELECTOR_SEPARATOR = "/"

export function stringifyVsCodeLmModelSelector(selector: VsCodeLmModelSelector): string {
	return [selector.vendor, selector.family, selector.version, selector.id].filter(Boolean).join(SELECTOR_SEPARATOR)
}
