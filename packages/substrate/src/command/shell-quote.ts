/**
 * shellQuote — single POSIX single-quoting choke point.
 *
 * Promoted verbatim from the inline `shellQuote`/`q` in
 * docker-backend/src/conductor/runtime-commands.ts and substrate-daytona.ts
 * (they duplicated it). Security-critical: the prompt is UNTRUSTED, so this is
 * the one place both local and remote substrates quote it before it touches a
 * shell command line. Wraps in single quotes and escapes embedded single quotes.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
