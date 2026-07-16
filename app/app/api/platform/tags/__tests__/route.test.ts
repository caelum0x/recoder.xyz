import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ecosystem_tags: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    ecosystem_tag_items: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock("@/lib/auth-helpers", () => ({
  getUserFromToken: vi.fn(),
}));

vi.mock("@/lib/plan-limits", () => ({
  checkPlanLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

describe("GET /api/platform/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUserFromToken as any).mockResolvedValue({ id: "u1" });
  });

  it("returns 401 if not authenticated", async () => {
    (getUserFromToken as any).mockResolvedValue(null);
    const { GET } = await import("../route");
    const res = await GET(new Request("https://recoder.xyz/api/platform/tags") as any);
    expect(res.status).toBe(401);
  });

  it("lists user tags", async () => {
    (prisma.ecosystem_tags.findMany as any).mockResolvedValue([
      { id: "t1", name: "Q1 Launch", slug: "q1-launch", color: "#f97316", items: [] },
    ]);
    const { GET } = await import("../route");
    const res = await GET(new Request("https://recoder.xyz/api/platform/tags") as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tags).toHaveLength(1);
  });
});

describe("POST /api/platform/tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUserFromToken as any).mockResolvedValue({ id: "u1" });
  });

  it("creates a new tag", async () => {
    (prisma.ecosystem_tags.create as any).mockResolvedValue({
      id: "t1",
      name: "Q1 Launch",
      slug: "q1-launch",
    });
    const { POST } = await import("../route");
    const res = await POST(
      new Request("https://recoder.xyz/api/platform/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Q1 Launch", color: "#f97316" }),
      }) as any
    );
    expect(res.status).toBe(201);
  });

  it("rejects missing name", async () => {
    const { POST } = await import("../route");
    const res = await POST(
      new Request("https://recoder.xyz/api/platform/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }) as any
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/platform/tags/[id]/items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUserFromToken as any).mockResolvedValue({ id: "u1" });
    (prisma.ecosystem_tags.findUnique as any).mockResolvedValue({ id: "t1", userId: "u1" });
  });

  it("links an item to a tag", async () => {
    (prisma.ecosystem_tag_items.create as any).mockResolvedValue({ id: "i1" });
    const mod = await import("../[id]/items/route");
    const res = await mod.POST(
      new Request("https://recoder.xyz/api/platform/tags/t1/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceApp: "agents",
          externalId: "wf-123",
          label: "Daily Report",
          itemType: "workflow",
          itemUrl: "https://agents.recoder.xyz/workflows/wf-123",
        }),
      }) as any,
      { params: Promise.resolve({ id: "t1" }) }
    );
    expect(res.status).toBe(201);
  });

  it("rejects linking to another user's tag", async () => {
    (prisma.ecosystem_tags.findUnique as any).mockResolvedValue({ id: "t1", userId: "other" });
    const mod = await import("../[id]/items/route");
    const res = await mod.POST(
      new Request("https://recoder.xyz/api/platform/tags/t1/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceApp: "agents",
          externalId: "wf-123",
          label: "Test",
          itemType: "workflow",
          itemUrl: "https://agents.recoder.xyz/workflows/wf-123",
        }),
      }) as any,
      { params: Promise.resolve({ id: "t1" }) }
    );
    expect(res.status).toBe(403);
  });
});
