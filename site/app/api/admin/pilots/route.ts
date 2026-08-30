import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  hasDesignPartnerLead,
  readAdminDesignPartnerLeadRefs,
} from "../../leads/store";
import {
  createPilotRecord,
  METRIC_DIRECTIONS,
  PILOT_STATUSES,
  PilotStoreFullError,
  readAdminPilotRecords,
  updatePilotRecord,
  type UpdatePilotInput,
} from "../../pilots/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PilotBody {
  pilotId?: unknown;
  designPartnerLeadId?: unknown;
  metricName?: unknown;
  metricUnit?: unknown;
  metricDirection?: unknown;
  baselineValue?: unknown;
  targetValue?: unknown;
  outcomeValue?: unknown;
  proofUrl?: unknown;
  status?: unknown;
}

export async function GET(request: Request): Promise<NextResponse> {
  const authFailure = authorize(request.headers);
  if (authFailure) return authFailure;

  try {
    const [leadRefs, pilots] = await Promise.all([
      readAdminDesignPartnerLeadRefs(),
      readAdminPilotRecords(),
    ]);
    return NextResponse.json({ success: true, leadRefs, pilots }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return storeFailure(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const authFailure = authorize(request.headers);
  if (authFailure) return authFailure;

  const body = await readBody(request);
  if (body instanceof NextResponse) return body;

  const designPartnerLeadId = boundedString(body.designPartnerLeadId, 160);
  const metricName = boundedString(body.metricName, 120);
  const metricUnit = boundedString(body.metricUnit, 40);
  const metricDirection = enumValue(body.metricDirection, METRIC_DIRECTIONS);
  const baselineValue = finiteNumber(body.baselineValue);
  const targetValue = finiteNumber(body.targetValue);
  if (
    !designPartnerLeadId ||
    !metricName ||
    !metricUnit ||
    !metricDirection ||
    baselineValue === null ||
    targetValue === null
  ) {
    return jsonError("A linked design-partner lead, measure, unit, direction, baseline, and target are required.", 400);
  }

  try {
    if (!(await hasDesignPartnerLead(designPartnerLeadId))) {
      return jsonError("The design-partner lead does not exist.", 404);
    }
    const pilot = await createPilotRecord({
      designPartnerLeadId,
      metricName,
      metricUnit,
      metricDirection,
      baselineValue,
      targetValue,
    });
    return NextResponse.json({ success: true, pilot }, {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return storeFailure(error);
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const authFailure = authorize(request.headers);
  if (authFailure) return authFailure;

  const body = await readBody(request);
  if (body instanceof NextResponse) return body;
  const pilotId = boundedString(body.pilotId, 160);
  if (!pilotId) return jsonError("pilotId is required.", 400);

  const patch: UpdatePilotInput = {};
  if (body.status !== undefined) {
    const status = enumValue(body.status, PILOT_STATUSES);
    if (!status) return jsonError("Unknown pilot status.", 400);
    patch.status = status;
  }
  if (body.metricDirection !== undefined) {
    const direction = enumValue(body.metricDirection, METRIC_DIRECTIONS);
    if (!direction) return jsonError("Unknown metric direction.", 400);
    patch.metricDirection = direction;
  }
  for (const [key, limit] of [["metricName", 120], ["metricUnit", 40]] as const) {
    if (body[key] === undefined) continue;
    const value = boundedString(body[key], limit);
    if (!value) return jsonError(`${key} cannot be empty.`, 400);
    patch[key] = value;
  }
  for (const key of ["baselineValue", "targetValue"] as const) {
    if (body[key] === undefined) continue;
    const value = finiteNumber(body[key]);
    if (value === null) return jsonError(`${key} must be a finite number.`, 400);
    patch[key] = value;
  }
  if (body.outcomeValue !== undefined) {
    const outcome = body.outcomeValue === null ? null : finiteNumber(body.outcomeValue);
    if (outcome === null && body.outcomeValue !== null) {
      return jsonError("outcomeValue must be a finite number or null.", 400);
    }
    patch.outcomeValue = outcome;
  }
  if (body.proofUrl !== undefined) {
    if (body.proofUrl === null) {
      patch.proofUrl = null;
    } else {
      const proofUrl = boundedString(body.proofUrl, 2048);
      if (!proofUrl) return jsonError("proofUrl must be a URL or null.", 400);
      patch.proofUrl = proofUrl;
    }
  }
  if (Object.keys(patch).length === 0) {
    return jsonError("Provide at least one pilot field to update.", 400);
  }

  try {
    const pilot = await updatePilotRecord(pilotId, patch);
    if (!pilot) return jsonError("Pilot not found.", 404);
    return NextResponse.json({ success: true, pilot }, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("cannot move") || error.message.includes("terminal"))
    ) {
      return jsonError(error.message, 409);
    }
    if (error instanceof Error && error.message.startsWith("Pilot ")) {
      return jsonError(error.message, 400);
    }
    return storeFailure(error);
  }
}

function authorize(headers: Headers): NextResponse | null {
  const configured = process.env.RECODER_PILOT_ADMIN_SECRET;
  if (!configured) return jsonError("Pilot administration is unavailable.", 503);
  const authorization = headers.get("authorization") || "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const expectedBytes = Buffer.from(configured, "utf8");
  const providedBytes = Buffer.from(provided, "utf8");
  if (
    expectedBytes.length !== providedBytes.length ||
    !timingSafeEqual(new Uint8Array(expectedBytes), new Uint8Array(providedBytes))
  ) {
    return jsonError("Unauthorized.", 401);
  }
  return null;
}

async function readBody(request: Request): Promise<PilotBody | NextResponse> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return jsonError("JSON body must be an object.", 400);
    }
    return body as PilotBody;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }
}

function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000
    ? value
    : null;
}

function enumValue<T extends string>(value: unknown, choices: readonly T[]): T | null {
  return typeof value === "string" && choices.some((choice) => choice === value)
    ? value as T
    : null;
}

function storeFailure(error: unknown): NextResponse {
  if (error instanceof PilotStoreFullError) {
    return jsonError("Pilot storage is full. No record was written.", 503);
  }
  console.error("Pilot storage operation failed", error instanceof Error ? error.name : "unknown");
  return jsonError("Pilot storage is unavailable. No success was recorded.", 503);
}

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error }, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
