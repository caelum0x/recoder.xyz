import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

// A captured lead — either a "notify me when builds land" signup or a
// team/enterprise sales inquiry. Persisted to a newline-delimited JSON log.
export interface Lead {
  readonly id: string;
  readonly kind: "notify" | "sales" | "design-partner";
  readonly email: string;
  readonly platform?: string;
  readonly plan?: string;
  readonly message?: string;
  readonly source?: string;
  readonly teamSize?: string;
  readonly currentAgents?: string[];
  readonly deployment?: string;
  readonly primaryPain?: string;
  readonly weeklyRuns?: string;
  readonly evidenceRequired?: boolean;
  readonly pilotTiming?: string;
  readonly interviewConsent?: boolean;
  readonly createdAt: string;
}

export interface ValidationSummary {
  readonly generatedAt: string;
  readonly designPartners: number;
  readonly interviewConsents: number;
  readonly evidenceRequired: number;
  readonly readyNow: number;
  readonly highFrequencyTeams: number;
  readonly lastResponseAt: string | null;
  readonly primaryPains: Readonly<Record<string, number>>;
  readonly activeAgents: Readonly<Record<string, number>>;
}

export interface AdminDesignPartnerLeadRef {
  readonly id: string;
  readonly createdAt: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_PAIN_KEYS = new Set(["compare", "merge", "governance", "privacy", "cost", "reliability"]);
const PUBLIC_AGENT_KEYS = new Set(["claude code", "codex", "cursor", "opencode", "other"]);

/**
 * Hard cap on the leads log (≈2k+ leads at ~2.3KB each). The prod box runs
 * chronically near-full, so an unauthenticated append must be disk-bounded:
 * past the cap the write refuses (503 to the client) instead of filling the
 * volume. Raise deliberately if real volume ever approaches it.
 */
export const MAX_LEADS_FILE_BYTES = 5 * 1024 * 1024;

export function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && email.length <= 254 && EMAIL_RE.test(email);
}

/**
 * Resolve a writable directory for the leads log.
 * Prefers LEADS_DATA_DIR, falls back to a process-local data dir, then the OS
 * temp dir. We never silently swallow a write failure — callers surface it.
 */
function resolveDataDir(): string {
  if (process.env.LEADS_DATA_DIR) return process.env.LEADS_DATA_DIR;
  return path.join(process.cwd(), ".data");
}

function leadsFile(dir: string): string {
  return path.join(dir, "leads.ndjson");
}

/**
 * Persist a lead. Returns the stored record on success. Throws on failure so
 * the caller can return an honest error to the client (no fake success).
 *
 * Also POSTs to LEADS_WEBHOOK_URL when configured (best-effort: a webhook
 * failure does not lose the lead, which is already durably written to disk).
 */
export async function saveLead(
  input: Omit<Lead, "id" | "createdAt">,
): Promise<Lead> {
  const lead: Lead = {
    ...input,
    id: cryptoRandomId(),
    createdAt: new Date().toISOString(),
  };

  let dir = resolveDataDir();
  try {
    await fs.mkdir(dir, { recursive: true });
    await assertUnderSizeCap(leadsFile(dir));
    await fs.appendFile(leadsFile(dir), JSON.stringify(lead) + "\n", "utf8");
  } catch (error) {
    if (error instanceof LeadsLogFullError) throw error;
    // Fall back to the OS temp dir if the preferred dir is not writable
    // (read-only deployment FS). If this also fails, the error propagates.
    dir = path.join(os.tmpdir(), "recoder-leads");
    await fs.mkdir(dir, { recursive: true });
    await assertUnderSizeCap(leadsFile(dir));
    await fs.appendFile(leadsFile(dir), JSON.stringify(lead) + "\n", "utf8");
  }

  await forwardToWebhook(lead);
  await syncToNewsletter(lead);
  return lead;
}

/** The leads log hit its disk-bound cap — the one write failure that must NOT
 * fall through to the temp-dir retry (the cap is the point, not the path). */
export class LeadsLogFullError extends Error {
  constructor() {
    super("leads log is at its size cap");
    this.name = "LeadsLogFullError";
  }
}

class LeadsLogCorruptError extends Error {
  constructor() {
    super("leads log contains an invalid complete record");
    this.name = "LeadsLogCorruptError";
  }
}

async function assertUnderSizeCap(file: string): Promise<void> {
  try {
    const stat = await fs.stat(file);
    if (stat.size >= MAX_LEADS_FILE_BYTES) throw new LeadsLogFullError();
  } catch (error) {
    if (error instanceof LeadsLogFullError) throw error;
    // Missing file = empty log = under cap.
  }
}

async function forwardToWebhook(lead: Lead): Promise<void> {
  const url = process.env.LEADS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(lead),
    });
  } catch {
    // Best-effort. The lead is already persisted to disk above.
  }
}

/**
 * Best-effort sync of the captured email into the app's DB-backed newsletter
 * list, so leads are reachable by campaigns instead of stranded in the NDJSON
 * file. The app route is public, zod-validated, rate-limited, and dedupes on
 * email. A sync failure NEVER fails the lead capture — the file written above
 * remains the source of truth.
 *
 * Consent gate (KVKK/GDPR/CAN-SPAM): only "notify" leads are synced — that
 * form's copy explicitly asks to email the guide + release updates, i.e.
 * grants marketing consent. Sales and design-partner submissions are contact
 * requests, not marketing opt-ins, and /api/newsletter/subscribe also
 * RE-ACTIVATES previously unsubscribed emails, so enrolling them would be
 * marketing without consent.
 */
async function syncToNewsletter(lead: Lead): Promise<void> {
  if (lead.kind !== "notify") return;
  const base = process.env.APP_INTERNAL_URL || "https://recoder.xyz";
  try {
    const response = await fetch(`${base}/api/newsletter/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: lead.email, source: `lead-${lead.kind}` }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.warn(
        `Lead ${lead.id}: newsletter sync answered ${response.status} (lead still stored on disk)`,
      );
    }
  } catch (error) {
    console.warn(`Lead ${lead.id}: newsletter sync failed (lead still stored on disk)`, error);
  }
}

function cryptoRandomId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

/**
 * Read a privacy-safe aggregate of design-partner responses. Individual emails,
 * messages and identifiers never leave the lead store. An interrupted final
 * append is ignored; a malformed complete record fails loudly so corruption
 * cannot be misreported as a lower count.
 */
export async function readValidationSummary(): Promise<ValidationSummary> {
  const leads = [...(await readStoredDesignPartnerLeads()).values()];
  const primaryPains: Record<string, number> = {};
  const activeAgents: Record<string, number> = {};
  for (const lead of leads) {
    if (lead.primaryPain && PUBLIC_PAIN_KEYS.has(lead.primaryPain)) {
      primaryPains[lead.primaryPain] = (primaryPains[lead.primaryPain] || 0) + 1;
    }
    for (const agent of lead.currentAgents || []) {
      if (PUBLIC_AGENT_KEYS.has(agent)) {
        activeAgents[agent] = (activeAgents[agent] || 0) + 1;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    designPartners: leads.length,
    interviewConsents: leads.filter((lead) => lead.interviewConsent).length,
    evidenceRequired: leads.filter((lead) => lead.evidenceRequired).length,
    readyNow: leads.filter((lead) => lead.pilotTiming === "now").length,
    highFrequencyTeams: leads.filter((lead) => ["21-100", "101+"].includes(lead.weeklyRuns || "")).length,
    lastResponseAt: leads.map((lead) => lead.createdAt).sort().at(-1) || null,
    primaryPains,
    activeAgents,
  };
}

/** Confirm an admin-supplied pilot parent without returning private lead data. */
export async function hasDesignPartnerLead(id: string): Promise<boolean> {
  return (await readStoredDesignPartnerLeads()).has(id);
}

/**
 * Return the minimum private lead reference needed by the pilot operator.
 * Email, company context, workflow text, and intake answers stay in this store.
 */
export async function readAdminDesignPartnerLeadRefs(): Promise<AdminDesignPartnerLeadRef[]> {
  const leads = [...(await readStoredDesignPartnerLeads()).values()];
  return leads
    .map((lead) => {
      if (lead.id.length > 160 || lead.createdAt.length > 64) {
        throw new LeadsLogCorruptError();
      }
      return { id: lead.id, createdAt: lead.createdAt };
    })
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function readStoredDesignPartnerLeads(): Promise<Map<string, Lead>> {
  const preferred = leadsFile(resolveDataDir());
  const fallback = leadsFile(path.join(os.tmpdir(), "recoder-leads"));
  const files = preferred === fallback ? [preferred] : [preferred, fallback];
  const byId = new Map<string, Lead>();

  for (const file of files) {
    let contents = "";
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
        const interruptedFinalAppend = index === lines.length - 1 && !contents.endsWith("\n");
        if (interruptedFinalAppend) continue;
        throw new LeadsLogCorruptError();
      }
      if (isDesignPartnerLead(candidate)) {
        byId.set(candidate.id, candidate);
      } else if (
        typeof candidate === "object" &&
        candidate !== null &&
        "kind" in candidate &&
        candidate.kind === "design-partner"
      ) {
        throw new LeadsLogCorruptError();
      }
    }
  }
  return byId;
}

function isDesignPartnerLead(value: unknown): value is Lead {
  if (typeof value !== "object" || value === null) return false;
  const lead = value as Partial<Lead>;
  return (
    lead.kind === "design-partner" &&
    typeof lead.id === "string" &&
    lead.id.length > 0 &&
    typeof lead.email === "string" &&
    typeof lead.createdAt === "string"
  );
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
