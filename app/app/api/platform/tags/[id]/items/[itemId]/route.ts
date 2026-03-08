import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, itemId } = await params;
  const tag = await prisma.ecosystem_tags.findUnique({ where: { id } });
  if (!tag || tag.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const item = await prisma.ecosystem_tag_items.findFirst({ where: { id: itemId, tagId: id } });
  if (!item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.ecosystem_tag_items.delete({ where: { id: itemId } });
  return NextResponse.json({ deleted: true });
}
