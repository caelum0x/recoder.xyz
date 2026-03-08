import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { verifyInternalServiceRequest } from "@/lib/internal-service-auth";
import { checkPlanLimit } from "@/lib/plan-limits";
import { sendWebPush, isWebPushEnabled, isStaleSubscription } from "@/lib/push-server";

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
    (b.title as string).length <= 200 &&
    typeof b.message === "string" &&
    (b.message as string).length <= 2000 &&
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

  // Check daily notification limit
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayCount = await prisma.notifications.count({
    where: { userId: body.userId, createdAt: { gte: dayStart } },
  });
  const limitCheck = await checkPlanLimit(body.userId, "notifications_per_day", todayCount);
  if (!limitCheck.allowed) {
    return Response.json(limitCheck.error!.toJSON(), { status: 403 });
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

  // Send push if enabled
  if (channels.includes("push") && prefs.pushNotifications && isWebPushEnabled()) {
    const subscriptions = await prisma.web_push_subscriptions.findMany({
      where: { userId: body.userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    const staleIds: string[] = [];
    for (const sub of subscriptions) {
      const result = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        {
          title: body.title,
          body: body.message,
          url: body.actionUrl && isHttpsUrl(body.actionUrl) ? body.actionUrl : "/",
          timestamp: new Date().toISOString(),
          type: body.type,
        }
      );
      if (isStaleSubscription(result)) {
        staleIds.push(sub.id);
      }
    }
    // Prune stale subscriptions
    if (staleIds.length > 0) {
      await prisma.web_push_subscriptions.deleteMany({ where: { id: { in: staleIds } } }).catch(() => {});
    }
  }

  return NextResponse.json({ id: notification.id }, { status: 201 });
}
