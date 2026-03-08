import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const settings = await prisma.notification_settings.findUnique({
    where: { userId: user.id },
  });

  return NextResponse.json(
    settings ?? {
      emailNotifications: true,
      pushNotifications: false,
      weeklyReports: true,
      securityAlerts: true,
    }
  );
}

export async function PUT(request: NextRequest) {
  const user = await getUserFromToken(request);
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const allowed = ["emailNotifications", "pushNotifications", "weeklyReports", "securityAlerts"];
  const data: Record<string, boolean> = {};
  for (const key of allowed) {
    if (typeof body[key] === "boolean") {
      data[key] = body[key];
    }
  }

  const settings = await prisma.notification_settings.upsert({
    where: { userId: user.id },
    update: data,
    create: {
      id: crypto.randomUUID(),
      userId: user.id,
      ...data,
    },
  });

  return NextResponse.json(settings);
}
