import { NextResponse } from "next/server";
import { isValidEmail, saveLead } from "./store";
import { clientIpFrom, isHoneypotTripped, takeRateLimitToken } from "./guards";

// Run on the Node.js runtime — we write the lead to disk.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["notify", "sales", "design-partner"]);
const PLATFORMS = new Set(["macos", "windows", "linux", "any"]);
const TEAM_SIZES = new Set(["1", "2-10", "11-50", "51-200", "201+"]);
const DEPLOYMENTS = new Set(["local", "cloud", "both"]);
const PRIMARY_PAINS = new Set([
  "compare",
  "merge",
  "governance",
  "privacy",
  "cost",
  "reliability",
]);
const WEEKLY_RUNS = new Set(["0-5", "6-20", "21-100", "101+"]);
const PILOT_TIMINGS = new Set(["now", "30-days", "quarter", "research"]);
const CURRENT_AGENTS = new Set(["claude code", "codex", "cursor", "opencode", "other"]);

interface LeadBody {
  kind?: unknown;
  email?: unknown;
  platform?: unknown;
  plan?: unknown;
  message?: unknown;
  source?: unknown;
  teamSize?: unknown;
  currentAgents?: unknown;
  deployment?: unknown;
  primaryPain?: unknown;
  weeklyRuns?: unknown;
  evidenceRequired?: unknown;
  pilotTiming?: unknown;
  interviewConsent?: unknown;
  /** Honeypot — never rendered in the real form; bots autofill it. */
  website?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!takeRateLimitToken(clientIpFrom(request.headers), Date.now())) {
    return NextResponse.json(
      { success: false, error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }

  let body: LeadBody;
  try {
    body = (await request.json()) as LeadBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (isHoneypotTripped(body)) {
    // Tripped honeypot: drop without storing, answer as if stored so the bot
    // doesn't learn to skip the field (see guards.ts for the rationale).
    return NextResponse.json({ success: true, id: "ok" }, { status: 201 });
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
  const teamSize = enumString(body.teamSize, TEAM_SIZES);
  const currentAgents = enumList(body.currentAgents, CURRENT_AGENTS, 5);
  const deployment = enumString(body.deployment, DEPLOYMENTS);
  const primaryPain = enumString(body.primaryPain, PRIMARY_PAINS);
  const weeklyRuns = enumString(body.weeklyRuns, WEEKLY_RUNS);
  const pilotTiming = enumString(body.pilotTiming, PILOT_TIMINGS);
  const evidenceRequired = typeof body.evidenceRequired === "boolean" ? body.evidenceRequired : undefined;
  const interviewConsent = typeof body.interviewConsent === "boolean" ? body.interviewConsent : undefined;

  if (
    kind === "design-partner" &&
    (!teamSize || currentAgents.length === 0 || !deployment || !primaryPain || !weeklyRuns || !pilotTiming)
  ) {
    return NextResponse.json(
      { success: false, error: "Complete every product-fit field." },
      { status: 400 },
    );
  }

  try {
    const lead = await saveLead({
      kind: kind as "notify" | "sales" | "design-partner",
      email: body.email,
      platform,
      plan,
      message,
      source,
      teamSize,
      currentAgents: currentAgents.length ? currentAgents : undefined,
      deployment,
      primaryPain,
      weeklyRuns,
      evidenceRequired,
      pilotTiming,
      interviewConsent,
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

function enumString(value: unknown, allowed: Set<string>): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return allowed.has(normalized) ? normalized : undefined;
}

function enumList(value: unknown, allowed: Set<string>, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
      .filter((item) => allowed.has(item)),
  )).slice(0, maxItems);
}
