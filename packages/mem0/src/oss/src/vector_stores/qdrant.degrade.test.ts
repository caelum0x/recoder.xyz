import { afterEach, describe, expect, it, vi } from "vitest";
import { Qdrant, describeQdrantError } from "./qdrant";
import { logger } from "../utils/logger";

/**
 * Proves the degrade-safe boot behavior: when Qdrant is unreachable the vendored
 * mem0 OSS must emit a SINGLE truthful WARN degrade line (engine=mem0/qdrant,
 * reason=ECONNREFUSED) instead of dumping raw `TypeError: fetch failed /
 * AggregateError [ECONNREFUSED]` stack traces to stderr via console.error.
 */

// Mimic Node's `fetch failed`: a TypeError whose cause is an AggregateError
// carrying the real ECONNREFUSED code on its aggregated errors.
function makeFetchFailedError(): Error {
  const inner: any = new Error("connect ECONNREFUSED 127.0.0.1:6333");
  inner.code = "ECONNREFUSED";
  const aggregate: any = new AggregateError([inner], "");
  const top: any = new TypeError("fetch failed");
  top.cause = aggregate;
  return top;
}

function makeUnreachableClient() {
  return {
    createCollection: vi.fn().mockRejectedValue(makeFetchFailedError()),
    getCollection: vi.fn(),
  } as any;
}

describe("Qdrant degrade-safe initialization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts ECONNREFUSED from the fetch-failed cause chain", () => {
    expect(describeQdrantError(makeFetchFailedError())).toBe("ECONNREFUSED");
  });

  it("emits one structured WARN degrade line and no raw stack dump", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const store = new Qdrant({
      client: makeUnreachableClient(),
      collectionName: "test_collection",
      embeddingModelDims: 1536,
      dimension: 1536,
    });

    // Explicit callers still receive the rejection (fail-fast preserved).
    await expect(store.initialize()).rejects.toThrow();

    // Exactly one truthful degrade line, tagged for engine + reason.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const line = warnSpy.mock.calls[0][0];
    expect(line).toContain("engine=mem0/qdrant");
    expect(line).toContain("status=degraded");
    expect(line).toContain("reason=ECONNREFUSED");

    // No raw stack dumped to stderr.
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
