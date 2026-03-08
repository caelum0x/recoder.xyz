import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { verifyInternalServiceRequest } from "@/lib/internal-service-auth";

const VALID_SOURCE_APPS = ["agents", "agency", "pm", "web"] as const;

interface PlatformEvent {
  type: string;
  userId: string;
  title: string;
  message: string;
  sourceApp: (typeof VALID_SOURCE_APPS)[number];
  actionUrl?: string;
  channels?: ("in_app" | "email" | "push")[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function validateEvent(body: unknown): body is PlatformEvent {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.type === "string" &&
    typeof b.userId === "string" &&
    typeof b.title === "string" &&
    typeof b.message === "string" &&
    typeof b.sourceApp === "string" &&
    VALID_SOURCE_APPS.includes(b.sourceApp as any)
  );
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const authResult = verifyInternalServiceRequest(request, { rawBody });
  if (!authResult.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: authResult.reason },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!validateEvent(body)) {
    return NextResponse.json(
      { error: "invalid_event", required: ["type", "userId", "title", "message", "sourceApp"] },
      { status: 400 }
    );
  }

  // Write in-app notification
  const notification = await prisma.notifications.create({
    data: {
      id: crypto.randomUUID(),
      userId: body.userId,
      title: body.title,
      message: body.message,
      type: body.type,
      actionUrl: body.actionUrl && isHttpsUrl(body.actionUrl) ? body.actionUrl : null,
      metadata: { sourceApp: body.sourceApp },
    },
  });

  // Check user notification preferences
  const settings = await prisma.notification_settings.findUnique({
    where: { userId: body.userId },
  });

  const channels = body.channels ?? ["in_app", "email", "push"];
  const prefs = settings ?? { emailNotifications: true, pushNotifications: false };

  // Send email if enabled
  if (channels.includes("email") && prefs.emailNotifications) {
    const user = await prisma.users.findUnique({
      where: { id: body.userId },
      select: { email: true, name: true },
    });
    if (user?.email) {
      await sendEmail({
        to: user.email,
        subject: body.title,
        html: `<p>${escapeHtml(body.message)}</p>${body.actionUrl && isHttpsUrl(body.actionUrl) ? `<p><a href="${escapeHtml(body.actionUrl)}">View details</a></p>` : ""}`,
        text: `${body.message}${body.actionUrl && isHttpsUrl(body.actionUrl) ? `\n\nView details: ${body.actionUrl}` : ""}`,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ id: notification.id }, { status: 201 });
}
