import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";
import { checkPlanLimit } from "@/lib/plan-limits";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tags = await prisma.ecosystem_tags.findMany({
    where: { userId: user.id },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ tags });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (body.name.length > 200) {
    return NextResponse.json({ error: "name must be 200 characters or fewer" }, { status: 400 });
  }

  // Check plan limit for tags
  const tagCount = await prisma.ecosystem_tags.count({ where: { userId: user.id } });
  const limitCheck = await checkPlanLimit(user.id, "tags", tagCount);
  if (!limitCheck.allowed) {
    return limitCheck.error!.toResponse();
  }

  let slug = slugify(body.name) || crypto.randomUUID().slice(0, 8);

  // Retry with random suffix on slug collision (per-user unique constraint)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const tag = await prisma.ecosystem_tags.create({
        data: {
          id: crypto.randomUUID(),
          name: body.name,
          slug,
          color: body.color ?? null,
          userId: user.id,
        },
      });
      return NextResponse.json(tag, { status: 201 });
    } catch (e: any) {
      // P2002 = unique constraint violation
      if (e?.code === "P2002" && attempt < 2) {
        slug = `${slugify(body.name)}-${crypto.randomUUID().slice(0, 6)}`;
        continue;
      }
      return NextResponse.json({ error: "tag_creation_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "tag_creation_failed" }, { status: 500 });
}
