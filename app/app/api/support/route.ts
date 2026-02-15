import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

const SUPPORT_EMAIL = "support@recoder.xyz";
const VALID_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

type SupportRequestPayload = {
  name: string;
  email: string;
  subject: string;
  message: string;
  priority: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function validatePayload(payload: SupportRequestPayload) {
  const name = payload.name?.trim();
  const email = payload.email?.trim().toLowerCase();
  const subject = payload.subject?.trim();
  const message = payload.message?.trim();
  const priority = payload.priority?.trim().toLowerCase();

  if (!name || name.length < 2 || name.length > 120) {
    return { ok: false as const, error: "Invalid name" };
  }

  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false as const, error: "Invalid email" };
  }

  if (!subject || subject.length < 3 || subject.length > 180) {
    return { ok: false as const, error: "Invalid subject" };
  }

  if (!message || message.length < 10 || message.length > 5000) {
    return { ok: false as const, error: "Invalid message" };
  }

  if (!priority || !VALID_PRIORITIES.has(priority)) {
    return { ok: false as const, error: "Invalid priority" };
  }

  return {
    ok: true as const,
    data: { name, email, subject, message, priority },
  };
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as SupportRequestPayload;
    const validation = validatePayload(payload);

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { name, email, subject, message, priority } = validation.data;
    const submittedAt = new Date().toISOString();
    const appUrl = process.env.NEXTAUTH_URL || "https://recoder.xyz";

    const emailResult = await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `[Support:${priority.toUpperCase()}] ${subject}`,
      html: `
        <h2>New Support Request</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Priority:</strong> ${escapeHtml(priority)}</p>
        <p><strong>Submitted At (UTC):</strong> ${escapeHtml(submittedAt)}</p>
        <p><strong>App URL:</strong> ${escapeHtml(appUrl)}</p>
        <hr />
        <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <p><strong>Message:</strong></p>
        <pre style="white-space: pre-wrap;">${escapeHtml(message)}</pre>
      `,
      text: [
        "New Support Request",
        `Name: ${name}`,
        `Email: ${email}`,
        `Priority: ${priority}`,
        `Submitted At (UTC): ${submittedAt}`,
        `App URL: ${appUrl}`,
        "",
        `Subject: ${subject}`,
        "",
        "Message:",
        message,
      ].join("\n"),
    });

    if (!emailResult.success) {
      return NextResponse.json(
        { error: "Support service is temporarily unavailable" },
        { status: 503 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Support request failed:", error);
    return NextResponse.json({ error: "Failed to submit support request" }, { status: 500 });
  }
}
