import { promises as fs } from 'node:fs';
import path from 'node:path';

export const NON_JS_SOURCE_EXTENSIONS = ['.py', '.go', '.rs'] as const;

export type LanguageEdge = {
  to: string;
  specifier: string;
};

export type LanguageImportResolver = {
  resolve(fromRelative: string, source: string): LanguageEdge[];
  specifiers(fromRelative: string, source: string): string[];
};

type PythonProject = { directory: string; roots: string[] };
type GoReplacement = { name: string; directory: string };
type GoModule = { directory: string; name: string; replacements: GoReplacement[] };
type GoWorkspace = { directory: string; uses: string[]; replacements: GoReplacement[] };
type CargoCrate = { directory: string; name: string };
type RustPathModule = { crateDirectory: string; module: string; target: string };

function toRepoRelative(repoRoot: string, absolutePath: string): string | null {
  const relative = path.relative(repoRoot, absolutePath).split(path.sep).join('/');
  if (relative === '..' || relative.startsWith('../') || path.posix.isAbsolute(relative)) return null;
  return relative === '.' ? '' : relative;
}

function ancestorDirectories(relativeFile: string): string[] {
  const directories: string[] = [];
  let directory = path.posix.dirname(relativeFile);
  for (;;) {
    const value = directory === '.' ? '' : directory;
    directories.push(value);
    if (!value) return directories;
    const parent = path.posix.dirname(value);
    directory = parent === '.' ? '' : parent;
  }
}

function isWithinDirectory(file: string, directory: string): boolean {
  return !directory || file === directory || file.startsWith(`${directory}/`);
}

function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

function uniqueEdges(edges: readonly LanguageEdge[], fromRelative: string): LanguageEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    if (edge.to === fromRelative || seen.has(`${edge.to}\0${edge.specifier}`)) return false;
    seen.add(`${edge.to}\0${edge.specifier}`);
    return true;
  });
}

type PythonImport = { module: string; imported: string[]; specifier: string };

function extractPythonImports(source: string): PythonImport[] {
  const imports: PythonImport[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const from = line.match(/^from\s+([A-Za-z_.][A-Za-z0-9_.]*)\s+import\s+(.+)$/);
    if (from?.[1] && from[2]) {
      const imported = from[2]
        .replace(/[()]/g, '')
        .split(',')
        .map((part) => part.trim().split(/\s+as\s+/)[0] ?? '')
        .filter((part) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(part));
      imports.push({ module: from[1], imported, specifier: from[1] });
      continue;
    }
    const direct = line.match(/^import\s+(.+)$/);
    if (!direct?.[1]) continue;
    for (const part of direct[1].split(',')) {
      const module = part.trim().split(/\s+as\s+/)[0] ?? '';
      if (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(module)) {
        imports.push({ module, imported: [], specifier: module });
      }
    }
  }
  return imports;
}

function resolvePythonBase(baseInput: string, fileSet: Set<string>): string[] {
  const base = path.posix.normalize(baseInput).replace(/^\.\//, '');
  if (!base || base === '..' || base.startsWith('../') || path.posix.isAbsolute(base)) return [];
  return [`${base}.py`, path.posix.join(base, '__init__.py')].filter((candidate) => fileSet.has(candidate));
}

function resolvePythonImport(
  fromRelative: string,
  imported: PythonImport,
  fileSet: Set<string>,
  projects: readonly PythonProject[],
): LanguageEdge[] {
  const leading = imported.module.match(/^\.+/)?.[0].length ?? 0;
  const moduleName = imported.module.slice(leading);
  const modulePath = moduleName.replace(/\./g, '/');
  const bases: string[] = [];
  if (leading > 0) {
    let directory = path.posix.dirname(fromRelative);
    for (let level = 1; level < leading; level += 1) directory = path.posix.dirname(directory);
    if (modulePath) bases.push(path.posix.join(directory, modulePath));
    for (const name of imported.imported) bases.push(path.posix.join(directory, modulePath, name));
  } else {
    for (const project of projects.filter((candidate) => isWithinDirectory(fromRelative, candidate.directory))) {
      for (const root of project.roots) {
        bases.push(path.posix.join(root, modulePath));
        for (const name of imported.imported) bases.push(path.posix.join(root, modulePath, name));
      }
    }
    for (const root of ancestorDirectories(fromRelative)) {
      bases.push(path.posix.join(root, modulePath));
      for (const name of imported.imported) bases.push(path.posix.join(root, modulePath, name));
    }
    if (!bases.includes(path.posix.join('src', modulePath))) bases.push(path.posix.join('src', modulePath));
  }
  return [...new Set(bases)]
    .flatMap((base) => resolvePythonBase(base, fileSet))
    .map((to) => ({ to, specifier: imported.specifier }));
}

function quotedValues(value: string): string[] {
  return [...value.matchAll(/["']([^"']+)["']/g)].flatMap((match) => match[1] ? [match[1]] : []);
}

function addRepoRoot(
  roots: Set<string>,
  repoRoot: string,
  configDirectory: string,
  rawPath: string,
): void {
  const trimmed = rawPath.trim();
  if (!trimmed || trimmed === '.') {
    roots.add(configDirectory);
    return;
  }
  const relative = toRepoRelative(repoRoot, path.resolve(repoRoot, configDirectory, trimmed));
  if (relative !== null) roots.add(relative);
}

function parsePythonTomlRoots(
  source: string,
  repoRoot: string,
  configDirectory: string,
): string[] {
  const roots = new Set<string>([configDirectory]);
  for (const match of source.matchAll(/^\s*package-dir\s*=\s*(.+)$/gmi)) {
    const value = match[1] ?? '';
    const candidates = value.trim().startsWith('{')
      ? [...value.matchAll(/=\s*["']([^"']+)["']/g)].flatMap((item) => item[1] ? [item[1]] : [])
      : quotedValues(value);
    for (const candidate of candidates) addRepoRoot(roots, repoRoot, configDirectory, candidate);
  }
  const packageDirHeader = /^\s*\[tool\.setuptools\.package-dir\]\s*$/mi.exec(source);
  const packageDirRemainder = packageDirHeader
    ? source.slice(packageDirHeader.index + packageDirHeader[0].length)
    : '';
  const nextHeader = packageDirRemainder.search(/^\s*\[/m);
  const packageDirSection = nextHeader === -1
    ? packageDirRemainder
    : packageDirRemainder.slice(0, nextHeader);
  for (const line of packageDirSection.split(/\r?\n/)) {
    const value = line.match(/=\s*["']([^"']+)["']/)?.[1];
    if (value) addRepoRoot(roots, repoRoot, configDirectory, value);
  }
  for (const packages of source.matchAll(/^\s*packages\s*=\s*\[([\s\S]*?)\]/gmi)) {
    for (const match of (packages[1] ?? '').matchAll(/\bfrom\s*=\s*["']([^"']+)["']/g)) {
      if (match[1]) addRepoRoot(roots, repoRoot, configDirectory, match[1]);
    }
  }
  for (const match of source.matchAll(/^\s*(?:mypy_path|extraPaths)\s*=\s*(\[[\s\S]*?\]|[^\n]+)/gmi)) {
    const value = match[1] ?? '';
    const candidates = quotedValues(value);
    for (const candidate of candidates.flatMap((item) => item.split(/[,:]/))) {
      addRepoRoot(roots, repoRoot, configDirectory, candidate);
    }
  }
  return [...roots];
}

function parseSetupCfgRoots(
  source: string,
  repoRoot: string,
  configDirectory: string,
): string[] {
  const roots = new Set<string>([configDirectory]);
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = (lines[index] ?? '').match(/^\s*(package_dir|pythonpath)\s*=\s*(.*)$/i);
    if (!match) continue;
    const values = [match[2] ?? ''];
    while (index + 1 < lines.length && /^\s+[^\s[]/.test(lines[index + 1] ?? '')) {
      values.push((lines[index + 1] ?? '').trim());
      index += 1;
    }
    for (const raw of values) {
      const value = match[1]?.toLowerCase() === 'package_dir' && raw.includes('=')
        ? raw.slice(raw.indexOf('=') + 1)
        : raw;
      for (const candidate of value.split(/[,:\s]+/).filter(Boolean)) {
        addRepoRoot(roots, repoRoot, configDirectory, candidate);
      }
    }
  }
  return [...roots];
}

function parsePyrightRoots(
  source: string,
  repoRoot: string,
  configDirectory: string,
): string[] {
  const roots = new Set<string>([configDirectory]);
  for (const match of source.matchAll(/["'](?:extraPaths)["']\s*:\s*\[([\s\S]*?)\]/g)) {
    for (const value of quotedValues(match[1] ?? '')) addRepoRoot(roots, repoRoot, configDirectory, value);
  }
  for (const match of source.matchAll(/["']root["']\s*:\s*["']([^"']+)["']/g)) {
    if (match[1]) addRepoRoot(roots, repoRoot, configDirectory, match[1]);
  }
  return [...roots];
}

async function discoverPythonProjects(
  repoRoot: string,
  relativeFiles: readonly string[],
): Promise<PythonProject[]> {
  const directories = new Set<string>();
  for (const file of relativeFiles.filter((value) => value.endsWith('.py'))) {
    for (const directory of ancestorDirectories(file)) directories.add(directory);
  }
  const projects: PythonProject[] = [];
  for (const directory of directories) {
    const configs = [
      { name: 'pyproject.toml', parse: parsePythonTomlRoots },
      { name: 'setup.cfg', parse: parseSetupCfgRoots },
      { name: 'pyrightconfig.json', parse: parsePyrightRoots },
    ] as const;
    const roots = new Set<string>();
    let found = false;
    for (const config of configs) {
      try {
        const source = await fs.readFile(path.join(repoRoot, directory, config.name), 'utf8');
        found = true;
        for (const root of config.parse(source, repoRoot, directory)) roots.add(root);
      } catch {
        // Most source ancestors do not carry Python project configuration.
      }
    }
    if (found) projects.push({ directory, roots: [...roots] });
  }
  return projects.sort((a, b) => b.directory.length - a.directory.length);
}

function extractGoImports(source: string): string[] {
  const clean = withoutComments(source);
  const found = new Set<string>();
  const blocks = [...clean.matchAll(/\bimport\s*\(([\s\S]*?)\)/g)];
  for (const block of blocks) {
    for (const quoted of (block[1] ?? '').matchAll(/["`]([^"`]+)["`]/g)) {
      if (quoted[1]) found.add(quoted[1]);
    }
  }
  const withoutBlocks = clean.replace(/\bimport\s*\([\s\S]*?\)/g, '');
  for (const direct of withoutBlocks.matchAll(/\bimport\s+(?:[._A-Za-z][\w.]*\s+)?["`]([^"`]+)["`]/g)) {
    if (direct[1]) found.add(direct[1]);
  }
  return [...found];
}

function goDirectiveLines(source: string, directive: 'replace' | 'use'): string[] {
  const clean = withoutComments(source);
  const lines: string[] = [];
  const blockPattern = new RegExp(`^\\s*${directive}\\s*\\(([\\s\\S]*?)\\)`, 'gm');
  for (const block of clean.matchAll(blockPattern)) {
    lines.push(...(block[1] ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  }
  const withoutBlocks = clean.replace(blockPattern, '');
  const directPattern = new RegExp(`^\\s*${directive}\\s+(.+)$`, 'gm');
  for (const direct of withoutBlocks.matchAll(directPattern)) {
    if (direct[1]?.trim()) lines.push(direct[1].trim());
  }
  return lines;
}

function parseGoReplacements(
  source: string,
  repoRoot: string,
  configDirectory: string,
): GoReplacement[] {
  const replacements: GoReplacement[] = [];
  for (const line of goDirectiveLines(source, 'replace')) {
    const match = line.match(/^(\S+)(?:\s+v\S+)?\s*=>\s*([./][^\s]+)\s*$/);
    if (!match?.[1] || !match[2]) continue;
    const directory = toRepoRelative(repoRoot, path.resolve(repoRoot, configDirectory, match[2]));
    if (directory !== null) replacements.push({ name: match[1], directory });
  }
  return replacements.sort((a, b) => b.name.length - a.name.length);
}

function parseGoWorkspaceUses(
  source: string,
  repoRoot: string,
  configDirectory: string,
): string[] {
  return goDirectiveLines(source, 'use').flatMap((line): string[] => {
    const target = line.split(/\s+/)[0];
    if (!target || (!target.startsWith('.') && !path.isAbsolute(target))) return [];
    const directory = toRepoRelative(repoRoot, path.resolve(repoRoot, configDirectory, target));
    return directory === null ? [] : [directory];
  });
}

function goTargets(directory: string, filesByDirectory: Map<string, string[]>): string[] {
  return (filesByDirectory.get(directory) ?? []).filter((file) => !file.endsWith('_test.go'));
}

function resolveGoImport(
  fromRelative: string,
  specifier: string,
  modules: readonly GoModule[],
  workspaces: readonly GoWorkspace[],
  filesByDirectory: Map<string, string[]>,
): LanguageEdge[] {
  let directory: string | null = null;
  if (specifier.startsWith('.')) {
    directory = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelative), specifier));
  } else {
    const owner = [...modules]
      .filter((candidate) => isWithinDirectory(fromRelative, candidate.directory))
      .sort((a, b) => b.directory.length - a.directory.length)[0];
    const workspace = workspaces.find((candidate) =>
      isWithinDirectory(fromRelative, candidate.directory) &&
      (candidate.uses.length === 0 || candidate.uses.some((root) => isWithinDirectory(fromRelative, root))));
    const mappings: GoReplacement[] = [
      ...(workspace?.replacements ?? []),
      ...(owner?.replacements ?? []),
      ...modules.map((module) => ({ name: module.name, directory: module.directory })),
    ].sort((a, b) => b.name.length - a.name.length);
    const mapping = mappings.find((candidate) =>
      specifier === candidate.name || specifier.startsWith(`${candidate.name}/`));
    if (mapping) {
      const suffix = specifier.slice(mapping.name.length).replace(/^\//, '');
      directory = path.posix.join(mapping.directory, suffix);
    }
  }
  if (!directory || directory === '..' || directory.startsWith('../')) return [];
  return goTargets(directory, filesByDirectory).map((to) => ({ to, specifier }));
}

type RustImport = { kind: 'mod' | 'path' | 'use'; path: string; specifier: string };

function expandRustUse(value: string): string[] {
  const clean = value.trim().replace(/\s+as\s+\w+$/, '').replace(/^::/, '');
  const open = clean.indexOf('{');
  const close = clean.lastIndexOf('}');
  if (open === -1 || close < open) return [clean];
  const prefix = clean.slice(0, open).replace(/::$/, '');
  return clean.slice(open + 1, close).split(',').flatMap((part): string[] => {
    const child = part.trim().replace(/\s+as\s+\w+$/, '');
    if (!child || child === 'self' || child.includes('{')) return [];
    return [`${prefix}::${child}`.replace(/^::/, '')];
  });
}

function extractRustImports(source: string): RustImport[] {
  const clean = withoutComments(source);
  const imports: RustImport[] = [];
  const pathModule = /#\s*\[\s*path\s*=\s*["']([^"']+)["']\s*\]\s*(?:#\s*\[[^\]]+\]\s*)*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g;
  for (const match of clean.matchAll(pathModule)) {
    if (match[1] && match[2]) {
      imports.push({ kind: 'path', path: match[1], specifier: `#[path = "${match[1]}"] mod ${match[2]}` });
    }
  }
  const conventionalModules = clean.replace(pathModule, '');
  for (const match of conventionalModules.matchAll(/\b(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g)) {
    if (match[1]) imports.push({ kind: 'mod', path: match[1], specifier: `mod ${match[1]}` });
  }
  for (const match of clean.matchAll(/\b(?:pub(?:\([^)]*\))?\s+)?use\s+([^;]+);/g)) {
    if (!match[1]) continue;
    for (const expanded of expandRustUse(match[1])) {
      imports.push({ kind: 'use', path: expanded, specifier: match[1].trim() });
    }
  }
  return imports;
}

function rustModuleDirectory(fromRelative: string): string {
  const directory = path.posix.dirname(fromRelative);
  const basename = path.posix.basename(fromRelative, '.rs');
  return basename === 'lib' || basename === 'main' || basename === 'mod'
    ? directory
    : path.posix.join(directory, basename);
}

function rustModuleCandidates(base: string, segments: readonly string[], fileSet: Set<string>): string[] {
  for (let length = segments.length; length > 0; length -= 1) {
    const modulePath = path.posix.join(base, ...segments.slice(0, length));
    const candidates = [`${modulePath}.rs`, path.posix.join(modulePath, 'mod.rs')]
      .filter((candidate) => fileSet.has(candidate));
    if (candidates.length > 0) return candidates;
  }
  const parentCandidates = [
    `${base}.rs`,
    path.posix.join(base, 'mod.rs'),
    path.posix.join(base, 'lib.rs'),
    path.posix.join(base, 'main.rs'),
  ].filter((candidate) => fileSet.has(candidate));
  return parentCandidates;
}

function nearestCargoDirectory(fromRelative: string, cargoCrates: readonly CargoCrate[]): string | null {
  const directories = new Set(cargoCrates.map((crate) => crate.directory));
  return ancestorDirectories(fromRelative).find((directory) => directories.has(directory)) ?? null;
}

function resolveRustImport(
  fromRelative: string,
  imported: RustImport,
  cargoCrates: readonly CargoCrate[],
  pathModules: readonly RustPathModule[],
  fileSet: Set<string>,
): LanguageEdge[] {
  if (imported.kind === 'path') {
    const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(fromRelative), imported.path));
    return candidate !== '..' && !candidate.startsWith('../') && fileSet.has(candidate)
      ? [{ to: candidate, specifier: imported.specifier }]
      : [];
  }
  if (imported.kind === 'mod') {
    return rustModuleCandidates(rustModuleDirectory(fromRelative), [imported.path], fileSet)
      .map((to) => ({ to, specifier: imported.specifier }));
  }

  const segments = imported.path.split('::').filter(Boolean);
  const first = segments[0];
  let base: string;
  let offset = 1;
  let owningCargo: string | null = null;
  if (first === 'crate') {
    const cargo = nearestCargoDirectory(fromRelative, cargoCrates);
    if (cargo === null) return [];
    owningCargo = cargo;
    base = path.posix.join(cargo, 'src');
  } else if (first === 'self') {
    base = rustModuleDirectory(fromRelative);
  } else if (first === 'super') {
    base = rustModuleDirectory(fromRelative);
    offset = 0;
    while (segments[offset] === 'super') {
      base = path.posix.dirname(base);
      offset += 1;
    }
  } else {
    const localCrate = cargoCrates.find((crate) => crate.name.replace(/-/g, '_') === first);
    if (!localCrate) return [];
    owningCargo = localCrate.directory;
    base = path.posix.join(localCrate.directory, 'src');
  }
  const aliasedModule = owningCargo
    ? pathModules.find((candidate) =>
      candidate.crateDirectory === owningCargo && candidate.module === segments[offset])
    : undefined;
  if (aliasedModule) return [{ to: aliasedModule.target, specifier: imported.specifier }];
  return rustModuleCandidates(base, segments.slice(offset), fileSet)
    .map((to) => ({ to, specifier: imported.specifier }));
}

async function discoverGoModules(repoRoot: string, relativeFiles: readonly string[]): Promise<GoModule[]> {
  const candidates = new Set<string>();
  for (const file of relativeFiles.filter((value) => value.endsWith('.go'))) {
    for (const directory of ancestorDirectories(file)) candidates.add(directory);
  }
  const modules: GoModule[] = [];
  for (const directory of candidates) {
    try {
      const source = await fs.readFile(path.join(repoRoot, directory, 'go.mod'), 'utf8');
      const name = source.match(/^\s*module\s+(\S+)\s*$/m)?.[1];
      if (name) modules.push({
        directory,
        name,
        replacements: parseGoReplacements(source, repoRoot, directory),
      });
    } catch {
      // Missing go.mod is the common case while walking ancestors.
    }
  }
  return modules.sort((a, b) => b.name.length - a.name.length);
}

async function discoverGoWorkspaces(repoRoot: string, relativeFiles: readonly string[]): Promise<GoWorkspace[]> {
  const candidates = new Set<string>();
  for (const file of relativeFiles.filter((value) => value.endsWith('.go'))) {
    for (const directory of ancestorDirectories(file)) candidates.add(directory);
  }
  const workspaces: GoWorkspace[] = [];
  for (const directory of candidates) {
    try {
      const source = await fs.readFile(path.join(repoRoot, directory, 'go.work'), 'utf8');
      workspaces.push({
        directory,
        uses: parseGoWorkspaceUses(source, repoRoot, directory),
        replacements: parseGoReplacements(source, repoRoot, directory),
      });
    } catch {
      // A go.work file is optional; only workspace roots carry one.
    }
  }
  return workspaces.sort((a, b) => b.directory.length - a.directory.length);
}

async function discoverCargoCrates(repoRoot: string, relativeFiles: readonly string[]): Promise<CargoCrate[]> {
  const candidates = new Set<string>();
  for (const file of relativeFiles.filter((value) => value.endsWith('.rs'))) {
    for (const directory of ancestorDirectories(file)) candidates.add(directory);
  }
  const found: CargoCrate[] = [];
  await Promise.all([...candidates].map(async (directory) => {
    try {
      const source = await fs.readFile(path.join(repoRoot, directory, 'Cargo.toml'), 'utf8');
      const header = /^\s*\[package\]\s*$/m.exec(source);
      if (!header) return;
      const remainder = source.slice(header.index + header[0].length);
      const nextHeader = remainder.search(/^\s*\[/m);
      const packageSection = nextHeader === -1 ? remainder : remainder.slice(0, nextHeader);
      const name = packageSection.match(/^\s*name\s*=\s*["']([^"']+)["']\s*$/m)?.[1];
      if (name) found.push({ directory, name });
    } catch {
      // Missing Cargo.toml is the common case while walking ancestors.
    }
  }));
  return found.sort((a, b) => b.name.length - a.name.length);
}

async function discoverRustPathModules(
  repoRoot: string,
  relativeFiles: readonly string[],
  cargoCrates: readonly CargoCrate[],
): Promise<RustPathModule[]> {
  const modules: RustPathModule[] = [];
  await Promise.all(relativeFiles.filter((file) => file.endsWith('.rs')).map(async (file) => {
    let source: string;
    try {
      source = await fs.readFile(path.join(repoRoot, file), 'utf8');
    } catch {
      return;
    }
    const crateDirectory = nearestCargoDirectory(file, cargoCrates);
    if (crateDirectory === null) return;
    for (const match of source.matchAll(/#\s*\[\s*path\s*=\s*["']([^"']+)["']\s*\]\s*(?:#\s*\[[^\]]+\]\s*)*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g)) {
      if (!match[1] || !match[2]) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
      if (relativeFiles.includes(target)) modules.push({ crateDirectory, module: match[2], target });
    }
  }));
  return modules;
}

/** Build reusable language metadata once per repository scan. */
export async function createLanguageImportResolver(
  repoRoot: string,
  relativeFiles: readonly string[],
): Promise<LanguageImportResolver> {
  const fileSet = new Set(relativeFiles);
  const filesByDirectory = new Map<string, string[]>();
  for (const file of relativeFiles.filter((value) => value.endsWith('.go'))) {
    const directory = path.posix.dirname(file);
    filesByDirectory.set(directory, [...(filesByDirectory.get(directory) ?? []), file].sort());
  }
  const [pythonProjects, goModules, goWorkspaces, cargoCrates] = await Promise.all([
    discoverPythonProjects(repoRoot, relativeFiles),
    discoverGoModules(repoRoot, relativeFiles),
    discoverGoWorkspaces(repoRoot, relativeFiles),
    discoverCargoCrates(repoRoot, relativeFiles),
  ]);
  const rustPathModules = await discoverRustPathModules(repoRoot, relativeFiles, cargoCrates);

  return {
    resolve(fromRelative, source): LanguageEdge[] {
      if (fromRelative.endsWith('.py')) {
        return uniqueEdges(
          extractPythonImports(source).flatMap((item) =>
            resolvePythonImport(fromRelative, item, fileSet, pythonProjects)),
          fromRelative,
        );
      }
      if (fromRelative.endsWith('.go')) {
        return uniqueEdges(
          extractGoImports(source).flatMap((specifier) =>
            resolveGoImport(fromRelative, specifier, goModules, goWorkspaces, filesByDirectory)),
          fromRelative,
        );
      }
      if (fromRelative.endsWith('.rs')) {
        return uniqueEdges(
          extractRustImports(source).flatMap((item) =>
            resolveRustImport(fromRelative, item, cargoCrates, rustPathModules, fileSet)),
          fromRelative,
        );
      }
      return [];
    },
    specifiers(fromRelative, source): string[] {
      if (fromRelative.endsWith('.py')) {
        return [...new Set(extractPythonImports(source).map((item) => item.specifier))].sort();
      }
      if (fromRelative.endsWith('.go')) return [...new Set(extractGoImports(source))].sort();
      if (fromRelative.endsWith('.rs')) {
        return [...new Set(extractRustImports(source).map((item) => item.path))].sort();
      }
      return [];
    },
  };
}
