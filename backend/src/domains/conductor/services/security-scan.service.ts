/**
 * `scanDiffForSecrets` — a deterministic, PURE secret scanner over a merge diff, the
 * first slice of the deterministic security gate (recoder-tcn1). Competitors gating a
 * merge (CodeRabbit/Gitleaks, Baz, Graphite, Continue) all run secret detection;
 * Recoder shipped none. Merging a leaked credential is a hard, non-negotiable block, so
 * this reads ONLY the lines the diff ADDS (a pre-existing secret is not this change's
 * fault) and matches high-signal credential shapes + secret-named assignments.
 *
 * PURE — no I/O, no network, deterministic. It DELIBERATELY favors precision: each rule
 * is a specific, well-known credential shape or a secret-named var assigned a long
 * literal, and every finding is REDACTED (never echoes the full secret into a log or
 * the UI). It is a HINT for a human, not an exhaustive SAST — the broader Semgrep/
 * dependency-risk layers are a sandbox follow-up. Never throws; empty/`null` diff ⇒ no
 * findings (never a fabricated pass, never a fabricated leak).
 */

/** One detected secret, redacted for safe display. */
export interface SecretFinding {
  /** The rule that matched (e.g. `aws-access-key`, `private-key`, `generic-secret`). */
  readonly rule: string;
  /** The file the added line lands in (from the diff `+++` header); `''` when unknown. */
  readonly file: string;
  /** A REDACTED snippet — enough to locate it, never the full secret. */
  readonly evidence: string;
}

export interface SecurityScanResult {
  readonly findings: readonly SecretFinding[];
  /** A short, truthful, reviewer-facing one-liner. */
  readonly summary: string;
}

/** Cap findings so a pathological diff cannot flood the surface. */
const MAX_FINDINGS = 50;

/** A credential-shape rule: a well-known token pattern matched on an ADDED line. */
interface SecretRule {
  readonly rule: string;
  readonly pattern: RegExp;
}

/**
 * High-precision credential shapes. Ordered by specificity; each is anchored to the
 * exact provider prefix + length so a random hex/base64 blob does NOT match (that is
 * the job of the secret-named-assignment rule, which requires the var name too).
 */
const SECRET_RULES: readonly SecretRule[] = [
  { rule: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { rule: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { rule: 'aws-secret-key', pattern: /\baws_secret_access_key\b\s*[=:]\s*['"]?[A-Za-z0-9/+]{40}['"]?/i },
  { rule: 'github-token', pattern: /\bgh[posru]_[A-Za-z0-9]{36,}\b/ },
  { rule: 'github-fine-grained', pattern: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/ },
  { rule: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { rule: 'openai-key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { rule: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { rule: 'stripe-key', pattern: /\b[rs]k_(?:live|test)_[0-9A-Za-z]{16,}\b/ },
  { rule: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { rule: 'private-key-id', pattern: /\bxapp-[0-9]-[A-Za-z0-9-]{20,}\b/ },
];

/** A secret-named var assigned a long, static, quoted literal — the generic catch. */
const SECRET_ASSIGNMENT =
  /\b(?:password|passwd|secret|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)\b\s*[=:]\s*['"][^'"\s]{12,}['"]/i;

/** Redact a matched value to a short, safe locator (prefix + length). */
function redact(rule: string, matched: string): string {
  const head = matched.slice(0, 4);
  return `${rule}: ${head}…(${matched.length} chars)`;
}

/**
 * Scan a unified diff for secrets the change ADDS. Tracks the current file from the
 * `+++ b/<path>` headers; inspects only single-`+` added lines (never the `+++` header,
 * never removed/context lines). Deduped, capped, redacted.
 */
export function scanDiffForSecrets(input: { readonly diffText: string | null }): SecurityScanResult {
  const diff = input.diffText;
  if (!diff) {
    return { findings: [], summary: 'no diff to scan for secrets' };
  }
  const findings: SecretFinding[] = [];
  const seen = new Set<string>();
  let file = '';

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).trim();
      file = path === '/dev/null' ? '' : path.replace(/^b\//, '');
      continue;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const added = line.slice(1);

    let matched: { rule: string; value: string } | null = null;
    for (const r of SECRET_RULES) {
      const m = r.pattern.exec(added);
      if (m) {
        matched = { rule: r.rule, value: m[0] };
        break;
      }
    }
    if (!matched) {
      const m = SECRET_ASSIGNMENT.exec(added);
      if (m) matched = { rule: 'generic-secret', value: m[0] };
    }
    if (!matched) continue;

    const key = `${file}:${matched.rule}:${matched.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ rule: matched.rule, file, evidence: redact(matched.rule, matched.value) });
    if (findings.length >= MAX_FINDINGS) break;
  }

  const summary =
    findings.length === 0
      ? 'no secrets detected in the diff'
      : `${findings.length} potential secret(s) added — remove before merging: ${findings
          .slice(0, 3)
          .map((f) => `${f.rule}${f.file ? ` (${f.file})` : ''}`)
          .join(', ')}`;
  return { findings, summary };
}
