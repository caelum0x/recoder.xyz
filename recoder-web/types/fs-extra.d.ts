declare module 'fs-extra' {
  import * as fs from 'fs';

  interface CopyOptions {
    overwrite?: boolean;
    errorOnExist?: boolean;
    filter?: (src: string, dest: string) => boolean | Promise<boolean>;
    preserveTimestamps?: boolean;
    dereference?: boolean;
  }

  interface EnsureDirOptions {
    mode?: number;
  }

  interface ReadJsonOptions {
    throws?: boolean;
    encoding?: string;
    reviver?: (key: any, value: any) => any;
  }

  interface WriteJsonOptions {
    spaces?: number | string;
    EOL?: string;
    replacer?: (key: string, value: any) => any;
    encoding?: string;
    mode?: number;
    flag?: string;
  }

  interface MoveOptions {
    overwrite?: boolean;
  }

  export function copy(src: string, dest: string, options?: CopyOptions): Promise<void>;
  export function copySync(src: string, dest: string, options?: CopyOptions): void;

  export function emptyDir(path: string): Promise<void>;
  export function emptyDirSync(path: string): void;

  export function ensureDir(path: string, options?: EnsureDirOptions): Promise<void>;
  export function ensureDirSync(path: string, options?: EnsureDirOptions): void;

  export function ensureFile(path: string): Promise<void>;
  export function ensureFileSync(path: string): void;

  export function ensureLink(srcpath: string, dstpath: string): Promise<void>;
  export function ensureLinkSync(srcpath: string, dstpath: string): void;

  export function ensureSymlink(srcpath: string, dstpath: string, type?: string): Promise<void>;
  export function ensureSymlinkSync(srcpath: string, dstpath: string, type?: string): void;

  export function mkdirs(dir: string, options?: EnsureDirOptions): Promise<void>;
  export function mkdirsSync(dir: string, options?: EnsureDirOptions): void;

  export function mkdirp(dir: string, options?: EnsureDirOptions): Promise<void>;
  export function mkdirpSync(dir: string, options?: EnsureDirOptions): void;

  export function move(src: string, dest: string, options?: MoveOptions): Promise<void>;
  export function moveSync(src: string, dest: string, options?: MoveOptions): void;

  export function outputFile(file: string, data: any, options?: string | WriteJsonOptions): Promise<void>;
  export function outputFileSync(file: string, data: any, options?: string | WriteJsonOptions): void;

  export function outputJson(file: string, object: any, options?: WriteJsonOptions): Promise<void>;
  export function outputJsonSync(file: string, object: any, options?: WriteJsonOptions): void;

  export function outputJSON(file: string, object: any, options?: WriteJsonOptions): Promise<void>;
  export function outputJSONSync(file: string, object: any, options?: WriteJsonOptions): void;

  export function pathExists(path: string): Promise<boolean>;
  export function pathExistsSync(path: string): boolean;

  export function readJson(file: string, options?: ReadJsonOptions): Promise<any>;
  export function readJsonSync(file: string, options?: ReadJsonOptions): any;

  export function readJSON(file: string, options?: ReadJsonOptions): Promise<any>;
  export function readJSONSync(file: string, options?: ReadJsonOptions): any;

  export function remove(path: string): Promise<void>;
  export function removeSync(path: string): void;

  export function writeJson(file: string, object: any, options?: WriteJsonOptions): Promise<void>;
  export function writeJsonSync(file: string, object: any, options?: WriteJsonOptions): void;

  export function writeJSON(file: string, object: any, options?: WriteJsonOptions): Promise<void>;
  export function writeJSONSync(file: string, object: any, options?: WriteJsonOptions): void;

  // Re-export everything from 'fs'
  export * from 'fs';
}