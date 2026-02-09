import { describe, expect, it } from "vitest";
import { replaceNullCharacters } from "./text";

describe("replaceNullCharacters", () => {
	it("returns the original string when it does not contain NUL characters", () => {
		const input = "hello";
		expect(replaceNullCharacters(input)).toBe(input);
	});

	it("replaces NUL characters with the Unicode replacement character", () => {
		const input = "hello\u0000world";
		const result = replaceNullCharacters(input);
		expect(result).toBe("hello\uFFFDworld");
	});

	it("supports overriding the replacement character", () => {
		const input = "a\u0000b\u0000c";
		const result = replaceNullCharacters(input, "?");
		expect(result).toBe("a?b?c");
	});
});
