/**
 * Capture types — recent agent terminal output and the incremental delta the
 * run-tailer emits (design §4.7). Full pane text vs the new suffix since the
 * last tick.
 */
export interface CaptureResult {
  /** Full captured pane/log text, or null if the handle is gone. */
  text: string | null;
  /** ISO-8601 timestamp the capture was taken. */
  at: string;
}

export interface CaptureDelta {
  /** New text appended since the previous capture (prefix-diff). */
  delta: string;
  /** Whether the delta was truncated to the configured cap. */
  truncated: boolean;
}
