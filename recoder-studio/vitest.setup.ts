import { vi } from "vitest";

// React's `cache` function is only available in React Server Components.
// In vitest's node environment it isn't provided, so we polyfill it as
// a pass-through to allow module-level imports that use it.
vi.mock("react", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react")>();
	return {
		...actual,
		cache: actual.cache ?? (<T extends (...args: unknown[]) => unknown>(fn: T) => fn),
	};
});
