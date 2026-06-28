// Owned by Recoder. The `sleep` primitive ported from OpenClaw's `src/utils.ts`.
// The upstream `utils.ts` is a large grab-bag; the extracted infra retry leaf
// needs only this one timer helper, so it is carried as its own minimal module
// rather than dragging the whole utils surface into the package.

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
