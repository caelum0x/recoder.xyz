import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { isIP } from "node:net";
import os from "node:os";
import path from "node:path";

export const PILOT_STATUSES = ["started", "completed", "verified", "cancelled"] as const;
export const METRIC_DIRECTIONS = ["increase", "decrease", "exact"] as const;

export type PilotStatus = (typeof PILOT_STATUSES)[number];
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number];

export interface PilotRecord {
  readonly id: string;
  readonly designPartnerLeadId: string;
  readonly metricName: string;
  readonly metricUnit: string;
  readonly metricDirection: MetricDirection;
  readonly baselineValue: number;
  readonly targetValue: number;
  readonly outcomeValue: number | null;
  readonly proofUrl: string | null;
  readonly status: PilotStatus;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly verifiedAt: string | null;
  readonly cancelledAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revision: number;
}

export interface CreatePilotInput {
  readonly designPartnerLeadId: string;
  readonly metricName: string;
  readonly metricUnit: string;
  readonly metricDirection: MetricDirection;
  readonly baselineValue: number;
  readonly targetValue: number;
}

export interface UpdatePilotInput {
  status?: PilotStatus;
  metricName?: string;
  metricUnit?: string;
  metricDirection?: MetricDirection;
  baselineValue?: number;
  targetValue?: number;
  outcomeValue?: number | null;
  proofUrl?: string | null;
}

export interface PilotAggregate {
  readonly startedPilots: number;
  readonly activePilots: number;
  readonly completedPilots: number;
  readonly verifiedOutcomes: number;
  readonly targetMet: number | null;
  readonly targetMissed: number | null;
  readonly targetMetRatePercent: number | null;
  readonly minimumOutcomeCohort: number;
}

const MAX_PILOTS_FILE_BYTES = 5 * 1024 * 1024;
const MINIMUM_PUBLIC_OUTCOME_COHORT = 3;
const TRANSITIONS: Readonly<Record<PilotStatus, readonly PilotStatus[]>> = {
  started: ["completed", "cancelled"],
  completed: ["verified", "cancelled"],
  verified: [],
  cancelled: [],
};

export class PilotStoreFullError extends Error {
  constructor() {
    super("pilot log is at its size cap");
    this.name = "PilotStoreFullError";
  }
}

export class PilotStoreCorruptError extends Error {
  constructor() {
    super("pilot log contains an invalid complete record");
    this.name = "PilotStoreCorruptError";
  }
}

export async function createPilotRecord(input: CreatePilotInput): Promise<PilotRecord> {
  const now = new Date().toISOString();
  const pilot: PilotRecord = {
    id: randomUUID(),
    designPartnerLeadId: input.designPartnerLeadId,
    metricName: input.metricName,
    metricUnit: input.metricUnit,
    metricDirection: input.metricDirection,
    baselineValue: input.baselineValue,
    targetValue: input.targetValue,
    outcomeValue: null,
    proofUrl: null,
    status: "started",
    startedAt: now,
    completedAt: null,
    verifiedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
  assertPilotInvariant(pilot);
  await appendPilotRecord(pilot);
  return pilot;
}

export async function updatePilotRecord(
  id: string,
  patch: UpdatePilotInput,
): Promise<PilotRecord | null> {
  const current = (await readPilotRecords()).get(id);
  if (!current) return null;
  if (current.status === "verified" || current.status === "cancelled") {
    throw new Error(`Pilot status ${current.status} is terminal.`);
  }

  const nextStatus = patch.status || current.status;
  if (
    nextStatus !== current.status &&
    !TRANSITIONS[current.status].includes(nextStatus)
  ) {
    throw new Error(`Pilot cannot move from ${current.status} to ${nextStatus}.`);
  }

  const now = new Date().toISOString();
  const pilot: PilotRecord = {
    ...current,
    ...patch,
    status: nextStatus,
    completedAt:
      nextStatus === "completed" && current.status !== "completed"
        ? now
        : current.completedAt,
    verifiedAt: nextStatus === "verified" ? now : current.verifiedAt,
    cancelledAt: nextStatus === "cancelled" ? now : current.cancelledAt,
    updatedAt: now,
    revision: current.revision + 1,
  };
  assertPilotInvariant(pilot);
  await appendPilotRecord(pilot);
  return pilot;
}

export async function readPilotAggregate(): Promise<PilotAggregate> {
  const pilots = [...(await readPilotRecords()).values()];
  const completedPilots = pilots.filter((pilot) =>
    pilot.status === "completed" || pilot.status === "verified"
  );
  const verified = pilots.filter((pilot) =>
    pilot.status === "verified" &&
    pilot.outcomeValue !== null &&
    pilot.proofUrl !== null &&
    isPublicHttpUrl(pilot.proofUrl)
  );
  const met = verified.filter(didMeetTarget).length;
  const publishOutcomeBreakdown = verified.length >= MINIMUM_PUBLIC_OUTCOME_COHORT;

  return {
    startedPilots: pilots.length,
    activePilots: pilots.filter((pilot) => pilot.status === "started").length,
    completedPilots: completedPilots.length,
    verifiedOutcomes: verified.length,
    targetMet: publishOutcomeBreakdown ? met : null,
    targetMissed: publishOutcomeBreakdown ? verified.length - met : null,
    targetMetRatePercent: publishOutcomeBreakdown
      ? Math.round((met / verified.length) * 100)
      : null,
    minimumOutcomeCohort: MINIMUM_PUBLIC_OUTCOME_COHORT,
  };
}

/** Return the current revision of each pilot for the authorized operator API. */
export async function readAdminPilotRecords(): Promise<PilotRecord[]> {
  const pilots = [...(await readPilotRecords()).values()];
  if (pilots.some((pilot) =>
    pilot.id.length > 160 ||
    pilot.designPartnerLeadId.length > 160 ||
    pilot.metricName.length > 120 ||
    pilot.metricUnit.length > 40 ||
    (pilot.proofUrl !== null && pilot.proofUrl.length > 2048) ||
    [
      pilot.startedAt,
      pilot.completedAt,
      pilot.verifiedAt,
      pilot.cancelledAt,
      pilot.createdAt,
      pilot.updatedAt,
    ].some((timestamp) => timestamp !== null && timestamp.length > 64)
  )) {
    throw new PilotStoreCorruptError();
  }
  return pilots.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function isPublicHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(url.protocol)) return false;
  if (url.username || url.password || !url.hostname) return false;

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid") ||
    hostname.endsWith(".example")
  ) {
    return false;
  }

  const ipVersion = isIP(hostname);
  if (ipVersion === 4) return !isPrivateOrReservedIpv4(hostname);
  if (ipVersion === 6) return !isPrivateOrReservedIpv6(hostname);
  return hostname.includes(".");
}

function didMeetTarget(pilot: PilotRecord): boolean {
  if (pilot.outcomeValue === null) return false;
  if (pilot.metricDirection === "increase") return pilot.outcomeValue >= pilot.targetValue;
  if (pilot.metricDirection === "decrease") return pilot.outcomeValue <= pilot.targetValue;
  return pilot.outcomeValue === pilot.targetValue;
}

function assertPilotInvariant(pilot: PilotRecord): void {
  if (!pilot.designPartnerLeadId || !pilot.metricName || !pilot.metricUnit) {
    throw new Error("Pilot requires a design-partner lead, measure, and unit.");
  }
  if (![pilot.baselineValue, pilot.targetValue].every(isFiniteMeasure)) {
    throw new Error("Pilot baseline and target must be finite numbers.");
  }
  if (pilot.outcomeValue !== null && !isFiniteMeasure(pilot.outcomeValue)) {
    throw new Error("Pilot outcome must be a finite number.");
  }
  if (pilot.proofUrl !== null && !isHttpUrl(pilot.proofUrl)) {
    throw new Error("Pilot proof URL must use HTTP or HTTPS.");
  }
  if (["completed", "verified"].includes(pilot.status) && pilot.outcomeValue === null) {
    throw new Error("A completed pilot requires an outcome.");
  }
  if (pilot.status === "completed" && !pilot.completedAt) {
    throw new Error("A completed pilot requires a completion time.");
  }
  if (pilot.status === "verified") {
    if (!pilot.completedAt || !pilot.verifiedAt) {
      throw new Error("A verified pilot requires completion and verification times.");
    }
    if (!pilot.proofUrl || !isPublicHttpUrl(pilot.proofUrl)) {
      throw new Error("A verified pilot requires a public HTTP(S) proof URL.");
    }
  }
}

function isFiniteMeasure(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function pilotDataDir(): string {
  return process.env.PILOTS_DATA_DIR || process.env.LEADS_DATA_DIR || path.join(process.cwd(), ".data");
}

function pilotsFile(dir: string): string {
  return path.join(dir, "pilots.ndjson");
}

async function appendPilotRecord(pilot: PilotRecord): Promise<void> {
  const preferred = pilotDataDir();
  try {
    await appendToDirectory(preferred, pilot);
  } catch (error) {
    if (error instanceof PilotStoreFullError) throw error;
    await appendToDirectory(path.join(os.tmpdir(), "recoder-leads"), pilot);
  }
}

async function appendToDirectory(dir: string, pilot: PilotRecord): Promise<void> {
  const file = pilotsFile(dir);
  const line = `${JSON.stringify(pilot)}\n`;
  await fs.mkdir(dir, { recursive: true });
  await assertUnderSizeCap(file, Buffer.byteLength(line));
  await fs.appendFile(file, line, "utf8");
}

async function assertUnderSizeCap(file: string, incomingBytes: number): Promise<void> {
  try {
    const stat = await fs.stat(file);
    if (stat.size + incomingBytes > MAX_PILOTS_FILE_BYTES) {
      throw new PilotStoreFullError();
    }
  } catch (error) {
    if (error instanceof PilotStoreFullError) throw error;
    if (!isMissingFile(error)) throw error;
  }
}

async function readPilotRecords(): Promise<Map<string, PilotRecord>> {
  const preferred = pilotsFile(pilotDataDir());
  const fallback = pilotsFile(path.join(os.tmpdir(), "recoder-leads"));
  const files = preferred === fallback ? [preferred] : [preferred, fallback];
  const pilots = new Map<string, PilotRecord>();

  for (const file of files) {
    let contents: string;
    try {
      contents = await fs.readFile(file, "utf8");
    } catch (error) {
      if (isMissingFile(error)) continue;
      throw error;
    }

    const lines = contents.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.trim()) continue;
      let candidate: unknown;
      try {
        candidate = JSON.parse(line);
      } catch {
        if (index === lines.length - 1) continue;
        throw new PilotStoreCorruptError();
      }
      if (!isPilotRecord(candidate)) throw new PilotStoreCorruptError();
      try {
        assertPilotInvariant(candidate);
      } catch {
        throw new PilotStoreCorruptError();
      }
      const current = pilots.get(candidate.id);
      if (!current || candidate.revision > current.revision) {
        pilots.set(candidate.id, candidate);
      }
    }
  }
  return pilots;
}

function isPilotRecord(value: unknown): value is PilotRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<PilotRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.designPartnerLeadId === "string" &&
    typeof record.metricName === "string" &&
    typeof record.metricUnit === "string" &&
    METRIC_DIRECTIONS.some((direction) => direction === record.metricDirection) &&
    typeof record.baselineValue === "number" &&
    typeof record.targetValue === "number" &&
    (record.outcomeValue === null || typeof record.outcomeValue === "number") &&
    (record.proofUrl === null || typeof record.proofUrl === "string") &&
    PILOT_STATUSES.some((status) => status === record.status) &&
    typeof record.startedAt === "string" &&
    (record.completedAt === null || typeof record.completedAt === "string") &&
    (record.verifiedAt === null || typeof record.verifiedAt === "string") &&
    (record.cancelledAt === null || typeof record.cancelledAt === "string") &&
    typeof record.createdAt === "string" &&
    typeof record.updatedAt === "string" &&
    typeof record.revision === "number" &&
    Number.isInteger(record.revision) &&
    record.revision > 0
  );
}

function isPrivateOrReservedIpv4(hostname: string): boolean {
  const [a, b, c] = hostname.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && [18, 19, 51].includes(b)) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPrivateOrReservedIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  const mappedIpv4 = mappedIpv4From(normalized);
  return mappedIpv4 ? isPrivateOrReservedIpv4(mappedIpv4) : false;
}

/**
 * Extract the embedded IPv4 from an IPv4-mapped or IPv4-compatible IPv6 address
 * so a loopback/private/metadata host (e.g. ::ffff:169.254.169.254) can't tunnel
 * past the private-IP denylist. `new URL()` canonicalises the dotted forms to hex
 * (::ffff:127.0.0.1 → ::ffff:7f00:1, and the deprecated compatible ::127.0.0.1 →
 * ::7f00:1, ::169.254.169.254 → ::a9fe:a9fe), so the optional `ffff:` prefix must
 * be accepted to decode both encodings.
 */
function mappedIpv4From(hostname: string): string | null {
  const dotted = hostname.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted) return dotted;
  const hex = hostname.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const high = parseInt(hex[1], 16);
  const low = parseInt(hex[2], 16);
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
