/**
 * Escapes special characters in a string to be used in a RegExp constructor.
 * This prevents regex injection vulnerabilities.
 */
export function escapeRegExp(string: string): string {
	return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
