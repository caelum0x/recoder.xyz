import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { fetchAllAppActivity } from "../services/platform-aggregator";

describe("fetchAllAppActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_SERVICE_KEY = "test-key-1234567890";
  });

  it("aggregates activity from all apps", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          app: "agents",
          stats: {
            totalItems: 5,
            activeItems: 3,
            lastActivityAt: "2026-03-08T00:00:00Z",
          },
          recentActivity: [
            {
              id: "a1",
              type: "workflow.run",
              title: "Test",
              timestamp: "2026-03-08T00:00:00Z",
              url: "https://agents.recoder.xyz/w/1",
            },
          ],
        }),
    });

    const results = await fetchAllAppActivity();
    expect(results).toHaveLength(4);
    expect(results[0].stats.totalItems).toBe(5);
  });

  it("handles app timeout gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("timeout"));

    const results = await fetchAllAppActivity();
    expect(results).toHaveLength(4);
    expect(results[0].error).toBe("unavailable");
    expect(results[0].stats.totalItems).toBe(0);
  });

  it("handles non-ok response gracefully", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const results = await fetchAllAppActivity();
    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.error).toBe("unavailable");
      expect(r.stats.activeItems).toBe(0);
      expect(r.recentActivity).toEqual([]);
    }
  });

  it("sends internal service key header", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          app: "agents",
          stats: { totalItems: 0, activeItems: 0, lastActivityAt: null },
          recentActivity: [],
        }),
    });

    await fetchAllAppActivity();

    expect(mockFetch).toHaveBeenCalledTimes(4);
    for (const call of mockFetch.mock.calls) {
      expect(call[1].headers["x-internal-service-key"]).toBe(
        "test-key-1234567890",
      );
    }
  });

  it("returns results for all 4 apps even when some fail", async () => {
    let callIndex = 0;
    mockFetch.mockImplementation(() => {
      callIndex++;
      if (callIndex <= 2) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              app: "ok",
              stats: { totalItems: 10, activeItems: 2, lastActivityAt: null },
              recentActivity: [],
            }),
        });
      }
      return Promise.reject(new Error("network error"));
    });

    const results = await fetchAllAppActivity();
    expect(results).toHaveLength(4);

    const ok = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    expect(ok).toHaveLength(2);
    expect(failed).toHaveLength(2);
  });
});
