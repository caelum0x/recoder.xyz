import type {
  BrainSourceKind,
  SourceProvenance,
  DegradeReason,
} from "../domain/provenance";

/**
 * Run one Brain source behind its port, degrade-safe, recording truthful
 * provenance. This is the enforcement arm of two of the brain's laws:
 *
 *   - "Fail safe, fail loud": a source that is not wired, throws, or is
 *     unreachable NEVER throws here — it degrades to its empty value and is
 *     annotated, so a single dark source can never fail the whole read.
 *   - "Truthful provenance": every source produces a {@link SourceProvenance}
 *     entry saying whether it contributed, how many items, and — when it didn't —
 *     why ("not_configured" / "unavailable" / "empty"). The Brain never implies a
 *     source succeeded without evidence.
 *
 * The result carries both the source's value (so the assembler fuses it) and its
 * provenance (so the context can report which sources lit up vs degraded).
 */

/** What running one source yields: its value plus a truthful provenance entry. */
export interface SourceOutcome<T> {
  readonly value: T;
  readonly provenance: SourceProvenance;
}

/** Inputs to run one source. */
export interface RunSourceInput<T> {
  /** Which source this is (for provenance). */
  readonly source: BrainSourceKind;
  /**
   * The source invocation, or null/undefined when no port is wired. When null we
   * record `not_configured` and never run anything.
   */
  readonly run: (() => Promise<T>) | null | undefined;
  /** The value to use when the source is absent or fails (e.g. []). */
  readonly fallback: T;
  /** Count the items a value contributed (e.g. arr.length). */
  readonly countItems: (value: T) => number;
  /** Human-readable detail when configured (e.g. "mem0 recall"). */
  readonly configuredDetail: string;
  /** Human-readable detail when NOT configured (e.g. "no memory port wired"). */
  readonly notConfiguredDetail: string;
}

function provenance(
  source: BrainSourceKind,
  itemCount: number,
  detail: string,
  degradeReason?: DegradeReason,
): SourceProvenance {
  const contributed = itemCount > 0 && degradeReason === undefined;
  return contributed
    ? { source, contributed: true, itemCount, detail }
    : {
        source,
        contributed: false,
        itemCount,
        degradeReason: degradeReason ?? "empty",
        detail,
      };
}

/**
 * Run one source. Never throws. Returns the source's value (its fallback on
 * absence/failure) plus a truthful provenance entry.
 */
export async function runSource<T>(
  input: RunSourceInput<T>,
): Promise<SourceOutcome<T>> {
  // Not wired — record not_configured, run nothing, use the fallback.
  if (!input.run) {
    return {
      value: input.fallback,
      provenance: provenance(
        input.source,
        0,
        input.notConfiguredDetail,
        "not_configured",
      ),
    };
  }

  try {
    const value = await input.run();
    const count = input.countItems(value);
    if (count <= 0) {
      // Ran cleanly but returned nothing — honestly "empty", not "contributed".
      return {
        value,
        provenance: provenance(
          input.source,
          0,
          `${input.configuredDetail}: returned no items`,
          "empty",
        ),
      };
    }
    return {
      value,
      provenance: provenance(
        input.source,
        count,
        `${input.configuredDetail}: ${count} item(s)`,
      ),
    };
  } catch (error) {
    // Wired but threw / unreachable — degrade to the fallback, mark unavailable.
    const reason = error instanceof Error ? error.message : "unknown error";
    return {
      value: input.fallback,
      provenance: provenance(
        input.source,
        0,
        `${input.configuredDetail}: unavailable (${reason})`,
        "unavailable",
      ),
    };
  }
}
