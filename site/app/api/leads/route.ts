import { NextResponse } from "next/server";
import { isValidEmail, saveLead } from "./store";

// Run on the Node.js runtime — we write the lead to disk.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["notify", "sales"]);
const PLATFORMS = new Set(["macos", "windows", "linux", "any"]);

interface LeadBody {
  kind?: unknown;
  email?: unknown;
  platform?: unknown;
  plan?: unknown;
  message?: unknown;
  source?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: LeadBody;
  try {
    body = (await request.json()) as LeadBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const kind = typeof body.kind === "string" ? body.kind : "";
  if (!KINDS.has(kind)) {
    return NextResponse.json(
      { success: false, error: "Unknown lead kind." },
      { status: 400 },
    );
  }

  if (!isValidEmail(body.email)) {
    return NextResponse.json(
      { success: false, error: "A valid email address is required." },
      { status: 400 },
    );
  }

  const platform =
    typeof body.platform === "string" && PLATFORMS.has(body.platform.toLowerCase())
      ? body.platform.toLowerCase()
      : undefined;

  const plan = clampString(body.plan, 64);
  const message = clampString(body.message, 2000);
  const source = clampString(body.source, 128);

  try {
    const lead = await saveLead({
      kind: kind as "notify" | "sales",
      email: body.email,
      platform,
      plan,
      message,
      source,
    });
    return NextResponse.json({ success: true, id: lead.id }, { status: 201 });
  } catch (error: unknown) {
    // Honest failure: do not claim success when the lead was not stored.
    console.error("Failed to persist lead", error);
    return NextResponse.json(
      {
        success: false,
        error:
          "We couldn't record that right now. Please email founders@recoder.xyz.",
      },
      { status: 503 },
    );
  }
}

function clampString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}
