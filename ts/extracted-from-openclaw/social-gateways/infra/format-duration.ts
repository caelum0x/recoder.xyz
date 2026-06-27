// Owned by Recoder. The raw gateway imported `../../infra/format-duration.js`
// for human-readable duration rendering; that infra sibling was not part of the
// extraction. The Discord adapter calls
// `formatDurationSeconds(ms, { decimals, unit })` when reporting slow listeners.
// Reconstructed here as its real, dependency-free behavior.

export type DurationUnit = "seconds" | "ms";

export interface FormatDurationOptions {
  /** Number of fractional digits to keep (default 0). */
  decimals?: number;
  /**
   * Output unit. `"seconds"` converts the millisecond input to seconds and
   * suffixes `s`; `"ms"` keeps milliseconds and suffixes `ms`.
   */
  unit?: DurationUnit;
}

function round(value: number, decimals: number): number {
  if (decimals <= 0) {
    return Math.round(value);
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Render a millisecond duration as a compact string. With `unit: "seconds"`
 * (the default), `1500ms` → `"1.5s"` at `decimals: 1`. With `unit: "ms"`,
 * `1500ms` → `"1500ms"`.
 */
export function formatDurationSeconds(
  durationMs: number,
  options: FormatDurationOptions = {},
): string {
  const decimals = Math.max(0, options.decimals ?? 0);
  const unit = options.unit ?? "seconds";
  const safeMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  if (unit === "ms") {
    return `${round(safeMs, decimals)}ms`;
  }
  const seconds = round(safeMs / 1000, decimals);
  return `${seconds}s`;
}
