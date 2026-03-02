/**
 * Type declarations for shell-quote.
 * Provides parse() for tokenizing shell commands and quote() for escaping arguments.
 */
declare module 'shell-quote' {
  export type ParseEntry =
    | string
    | { op: string }
    | { op: 'glob'; pattern: string }
    | { comment: string };

  /**
   * Parse a shell command string into tokens.
   */
  export function parse(
    cmd: string,
    env?: Record<string, string> | ((key: string) => string),
    opts?: { escape?: string },
  ): ParseEntry[];

  /**
   * Quote an array of arguments into a shell-safe string.
   */
  export function quote(args: string[]): string;
}
