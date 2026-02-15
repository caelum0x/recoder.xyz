const NULL_CHARACTER = "\u0000";
const DEFAULT_REPLACEMENT = "\uFFFD";

/**
 * Replace NUL ("\\u0000") characters with a safe replacement before persisting text.
 *
 * PostgreSQL text columns reject NUL bytes, so we swap them with the Unicode
 * replacement character by default. The function is idempotent and skips
 * allocation when the input does not contain NUL characters.
 */
export function replaceNullCharacters(
	value: string,
	replacement: string = DEFAULT_REPLACEMENT,
): string {
	if (!value.includes(NULL_CHARACTER)) {
		return value;
	}

	return value.replaceAll(NULL_CHARACTER, replacement);
}
