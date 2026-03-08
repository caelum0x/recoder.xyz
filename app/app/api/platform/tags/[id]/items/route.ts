import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

const VALID_SOURCE_APPS = ["agents", "agency", "pm", "web"];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const tag = await prisma.ecosystem_tags.findUnique({ where: { id } });
  if (!tag || tag.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const items = await prisma.ecosystem_tag_items.findMany({
    where: { tagId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const tag = await prisma.ecosystem_tags.findUnique({ where: { id } });
  if (!tag) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (tag.userId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json();
  if (
    !body.sourceApp ||
    !VALID_SOURCE_APPS.includes(body.sourceApp) ||
    !body.externalId ||
    !body.label ||
    !body.itemType ||
    !body.itemUrl
  ) {
    return NextResponse.json(
      { error: "missing_fields", required: ["sourceApp", "externalId", "label", "itemType", "itemUrl"] },
      { status: 400 }
    );
  }

  const item = await prisma.ecosystem_tag_items.create({
    data: {
      id: crypto.randomUUID(),
      tagId: id,
      sourceApp: body.sourceApp,
      externalId: body.externalId,
      label: body.label,
      itemType: body.itemType,
      itemUrl: body.itemUrl,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
