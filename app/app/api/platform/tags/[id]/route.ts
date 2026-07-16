import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getUserFromToken(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const tag = await prisma.ecosystem_tags.findUnique({ where: { id } });
  if (!tag || tag.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const updated = await prisma.ecosystem_tags.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.color !== undefined && { color: body.color }),
      },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}

export async function DELETE(
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

  try {
    await prisma.ecosystem_tags.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
