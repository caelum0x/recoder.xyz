export type SecretFinding = {
  kind: string;
  match: string;
  index: number;
};

const SECRET_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: 'openai_api_key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'anthropic_api_key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { kind: 'github_token', pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g },
  { kind: 'aws_access_key_id', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'private_key', pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/g },
];

export function redactSecret(value: string): string {
  if (value.length <= 10) return '[redacted]';
  return `${value.slice(0, 4)}...[redacted]...${value.slice(-4)}`;
}

export function scanSecrets(input: string): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const { kind, pattern } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(input)) !== null) {
      findings.push({
        kind,
        match: redactSecret(match[0]),
        index: match.index,
      });
    }
  }

  return findings;
}
