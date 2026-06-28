import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

// A captured lead — either a "notify me when builds land" signup or a
// team/enterprise sales inquiry. Persisted to a newline-delimited JSON log.
export interface Lead {
  readonly id: string;
  readonly kind: "notify" | "sales";
  readonly email: string;
  readonly platform?: string;
  readonly plan?: string;
  readonly message?: string;
  readonly source?: string;
  readonly createdAt: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    await fs.appendFile(leadsFile(dir), JSON.stringify(lead) + "\n", "utf8");
  } catch {
    // Fall back to the OS temp dir if the preferred dir is not writable
    // (read-only deployment FS). If this also fails, the error propagates.
    dir = path.join(os.tmpdir(), "recoder-leads");
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(leadsFile(dir), JSON.stringify(lead) + "\n", "utf8");
  }

  await forwardToWebhook(lead);
  return lead;
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

function cryptoRandomId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}
