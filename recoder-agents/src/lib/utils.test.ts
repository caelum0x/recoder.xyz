import { describe, expect, it, vi } from "vitest";
import { cn, colorWithOpacity, getRGBA } from "./utils";

describe("utils", () => {
	it("cn merges utility classes with tailwind conflict resolution", () => {
		expect(cn("p-2", "p-4", "text-sm", "text-lg")).toContain("p-4");
		expect(cn("p-2", "p-4", "text-sm", "text-lg")).toContain("text-lg");
	});

	it("colorWithOpacity preserves non-rgb values", () => {
		expect(colorWithOpacity("#fff", 0.5)).toBe("#fff");
	});

	it("colorWithOpacity converts rgb values to rgba", () => {
		const value = colorWithOpacity("rgb(255, 0, 0)", 0.25);
		expect(value).toContain("rgba(");
		expect(value).toContain("255");
	});

	it("getRGBA returns fallback when color is missing", () => {
		expect(getRGBA(undefined, "rgba(1, 1, 1, 1)")).toBe("rgba(1, 1, 1, 1)");
	});

	it("getRGBA returns fallback when parsing fails", () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			expect(getRGBA("definitely-not-a-color", "rgba(9, 9, 9, 1)")).toBe(
				"rgba(9, 9, 9, 1)",
			);
		} finally {
			errorSpy.mockRestore();
		}
	});
});
