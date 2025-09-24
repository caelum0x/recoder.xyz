// Type declarations for solc module
export interface SolcCompiler {
  compile(input: string, options?: { import?: (path: string) => { contents: string } }): string;
  loadRemoteVersion(version: string, callback: (err: any, compiler: SolcCompiler) => void): void;
  setupMethods(compiler: any): SolcCompiler;
}

export interface SolcVersionList {
  releases: Record<string, string>;
}

declare const solc: SolcCompiler & {
  default: SolcCompiler;
  loadRemoteVersionList(callback: (err: any, versions: SolcVersionList) => void): void;
};

export default solc;