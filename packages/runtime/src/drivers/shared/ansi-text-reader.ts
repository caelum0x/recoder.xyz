import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

// Standard ANSI escape sequence matcher (CSI + OSC + simple escapes).
// Built from a string source so the control bytes stay explicit and editor-safe.
const ANSI_PATTERN = new RegExp(
  [
    '[\\u001B\\u009B][[\\]()#;?]*',
    '(?:(?:(?:[a-zA-Z\\d]*(?:;[a-zA-Z\\d]*)*)?\\u0007)',
    '|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
  ].join(''),
  'g',
);

/** Strip ANSI escape sequences from a string (print-text CLIs). */
export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, '');
}

/**
 * Buffer + strip ANSI for print-text CLIs. Emits cleaned text chunks as they arrive,
 * and flushes any trailing partial line on stream end. Returns a detach function.
 */
export function attachAnsiTextReader(stream: Readable, onText: (text: string) => void): () => void {
  const decoder = new StringDecoder('utf8');

  const onData = (chunk: string | Buffer) => {
    const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
    if (text.length > 0) onText(stripAnsi(text));
  };

  const onEnd = () => {
    const tail = decoder.end();
    if (tail.length > 0) onText(stripAnsi(tail));
  };

  stream.on('data', onData);
  stream.on('end', onEnd);

  return () => {
    stream.off('data', onData);
    stream.off('end', onEnd);
  };
}
