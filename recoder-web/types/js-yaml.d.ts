declare module 'js-yaml' {
  interface LoadOptions {
    filename?: string;
    onWarning?: (warning: YAMLWarning) => void;
    schema?: Schema;
    json?: boolean;
  }

  interface DumpOptions {
    indent?: number;
    noArrayIndent?: boolean;
    skipInvalid?: boolean;
    flowLevel?: number;
    styles?: { [key: string]: any };
    schema?: Schema;
    sortKeys?: boolean | ((a: any, b: any) => number);
    lineWidth?: number;
    noRefs?: boolean;
    noCompatMode?: boolean;
    condenseFlow?: boolean;
    quotingType?: '"' | "'";
    forceQuotes?: boolean;
    replacer?: (key: string, value: any) => any;
  }

  interface YAMLWarning extends Error {
    reason: string;
    mark: {
      name: string;
      buffer: string;
      position: number;
      line: number;
      column: number;
    };
  }

  interface YAMLException extends Error {
    reason: string;
    mark: {
      name: string;
      buffer: string;
      position: number;
      line: number;
      column: number;
    };
  }

  interface Schema {
    include: Schema[];
    implicit: Type[];
    explicit: Type[];
  }

  interface Type {
    tag: string;
    kind: 'scalar' | 'sequence' | 'mapping';
    resolve: (data: any) => boolean;
    construct: (data: any) => any;
    instanceOf?: any;
    predicate?: (object: any) => boolean;
    represent?: ((object: any) => any) | { [style: string]: (object: any) => any };
    defaultStyle?: string;
    styleAliases?: { [alias: string]: string };
  }

  // Schemas
  export const FAILSAFE_SCHEMA: Schema;
  export const JSON_SCHEMA: Schema;
  export const CORE_SCHEMA: Schema;
  export const DEFAULT_SCHEMA: Schema;
  export const DEFAULT_SAFE_SCHEMA: Schema;
  export const DEFAULT_FULL_SCHEMA: Schema;

  // Main functions
  export function load(input: string, options?: LoadOptions): any;
  export function loadAll(input: string, iterator?: (doc: any) => void, options?: LoadOptions): any[];
  export function safeLoad(input: string, options?: LoadOptions): any;
  export function safeLoadAll(input: string, iterator?: (doc: any) => void, options?: LoadOptions): any[];

  export function dump(object: any, options?: DumpOptions): string;
  export function safeDump(object: any, options?: DumpOptions): string;

  // Types
  export class Type {
    constructor(tag: string, options: Partial<Type>);
  }

  export class Schema {
    constructor(definition: {
      include?: Schema[];
      implicit?: Type[];
      explicit?: Type[];
    });
  }

  // Exceptions
  export class YAMLException extends Error {
    constructor(reason?: string, mark?: any);
  }

  export { YAMLException as YamlException };
}