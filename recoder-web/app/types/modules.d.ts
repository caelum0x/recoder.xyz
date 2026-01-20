declare module 'shell-quote' {
  export function parse(cmd: string): string[];
  export function quote(args: string[]): string;
}

declare module 'fast-levenshtein' {
  export function get(str1: string, str2: string): number;
}

declare module 'picomatch' {
  function picomatch(pattern: string | string[], options?: any): (input: string) => boolean;
  namespace picomatch {
    function isMatch(input: string, pattern: string | string[], options?: any): boolean;
  }
  export = picomatch;
}

declare module 'mime-types' {
  export function lookup(path: string): string | false;
  export function extension(type: string): string | false;
  export function contentType(type: string): string | false;
}

declare module '@qwen-code/qwen-code-test-utils' {
  export function createMockFS(): any;
  export function createTestContext(): any;
}
