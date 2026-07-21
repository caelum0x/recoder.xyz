/**
 * Domain-boundary invariant guard (owner mandate 2026-07-21).
 *
 * The single rule this test enforces:
 *
 *   A file under `src/domains/<A>/` may NOT import a runtime VALUE from
 *   `src/domains/<B>/` (A !== B) — whether via a static `import`/`export`
 *   declaration with a value binding, OR via a dynamic `import(...)` call.
 *
 * Cross-domain reach must go through injected, consumer-owned ports built at
 * the composition root (`bootstrap/`), never a direct value import of another
 * domain's internal. Type-only seams are always legal because they are erased
 * at build and create zero runtime coupling.
 *
 * Mechanism: this is a vitest structural test (the `backend` package ships no
 * ESLint; `lint:engine` runs vitest), parsing each source with the TypeScript
 * compiler — exact `isTypeOnly` flags instead of regex, plus a recursive AST
 * descent so a lazy `await import(...)` nested inside a method body is caught
 * (a top-level-only walk would miss it).
 *
 * ALLOW-LIST (legal seams the guard permits — no value carve-outs):
 *   1. Type-only static cross-domain imports (`import type`, `export type`,
 *      `import { type X }`, or an import declaration with no value binding).
 *      This is the dominant seam (~214 sites) and covers consumer-owned
 *      `ports/*.port.ts` re-exports and producer `ports/**` / `types.ts` /
 *      `config.ts` barrels — all consumed type-only.
 *   2. `src/bootstrap/**` — the composition root is fully exempt (it wires
 *      deep internals as values by design, static or dynamic).
 *   3. `src/shared/**` and `@recoder/*` workspace packages — not another
 *      domain (leaf/shared layer), never a violation.
 *   4. Test scaffolding (`**\/__tests__/**`, `*.test.ts`, `*.spec.ts`,
 *      `**\/__fixtures__/**`) — importer exempt; may build real cross-domain
 *      stacks, static or dynamic.
 *
 * `fromDomain`/`toDomain` = first path segment under `src/domains/`. `interop`
 * and `interop-wire` are distinct domains. Specifiers resolving to
 * `../../shared/**`, `@recoder/*`, `node:*`, or the same domain are ignored.
 * A dynamic `import('...')` is ALWAYS a value edge (it resolves the runtime
 * module namespace — there is no type-only dynamic import), so any
 * cross-domain dynamic import is a violation.
 */
import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { readFileSync, globSync } from 'node:fs';
import path from 'node:path';

const DOMAINS_ROOT = path.resolve(__dirname, '../../domains');
const TEST_RE = /(\.test\.ts|\.spec\.ts|__tests__|__fixtures__)/;

type ImportKind = 'static' | 'dynamic';
type Violation = { from: string; to: string; spec: string; line: number; kind: ImportKind };

/** First path segment under `src/domains/`, or null if the file is outside it. */
function domainOf(file: string): string | null {
  const rel = path.relative(DOMAINS_ROOT, file);
  if (rel.startsWith('..')) return null;
  return rel.split(path.sep)[0];
}

/** Resolve a relative specifier to its target domain (null for shared/@recoder/node/same-tree). */
function targetDomain(file: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // @recoder/*, node:*, bare pkgs
  const abs = path.resolve(path.dirname(file), spec.replace(/\.js$/, '.ts'));
  return domainOf(abs);
}

/** A cross-domain VALUE import (static value decl OR any dynamic import) = a real runtime edge. */
function scanSource(file: string, text: string): Violation[] {
  const from = domainOf(file);
  if (!from || TEST_RE.test(file)) return [];
  const src = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const out: Violation[] = [];
  const lineOf = (node: ts.Node): number =>
    src.getLineAndCharacterOfPosition(node.getStart(src)).line + 1;

  // 1) Static import/export declarations (top-level).
  src.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) return;
    const specifier = node.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier)) return;
    const spec = specifier.text;
    const to = targetDomain(file, spec);
    if (!to || to === from) return; // same-domain or shared/ = legal
    const clause = ts.isImportDeclaration(node) ? node.importClause : undefined;
    const declTypeOnly =
      clause?.isTypeOnly || (ts.isExportDeclaration(node) && node.isTypeOnly);
    if (declTypeOnly) return; // fully type-only => erased => legal
    const named =
      clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
        ? clause.namedBindings.elements
        : [];
    const hasValueBinding =
      Boolean(clause?.name) || // default value import
      Boolean(clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) ||
      named.some((e) => !e.isTypeOnly); // any non-type specifier
    if (!hasValueBinding && named.length > 0) return; // all specifiers `type X` => legal
    out.push({ from, to, spec, line: lineOf(node), kind: 'static' });
  });

  // 2) Dynamic import(...) calls — RECURSIVE descent (may be nested in method bodies).
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      const spec = node.arguments[0].text;
      const to = targetDomain(file, spec);
      if (to && to !== from) out.push({ from, to, spec, line: lineOf(node), kind: 'dynamic' });
    }
    ts.forEachChild(node, visit); // descend into every node
  };
  ts.forEachChild(src, visit);

  return out;
}

function scan(file: string): Violation[] {
  return scanSource(file, readFileSync(file, 'utf8'));
}

describe('domain boundary invariant (owner mandate 2026-07-21)', () => {
  it('no domain imports a runtime VALUE from another domain internal (static or dynamic)', () => {
    const files = globSync(`${DOMAINS_ROOT}/**/*.ts`);
    expect(files.length).toBeGreaterThan(0); // sanity: the walk actually found sources
    const violations = files.flatMap(scan);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  // Self-test: static value edge fires.
  it('flags a planted static cross-domain value import', () => {
    const planted = scanSource(
      `${DOMAINS_ROOT}/memory/__planted__.ts`,
      `import { mem0Add } from '../engines/mem0-client.js';\nexport const x = mem0Add;\n`,
    );
    expect(planted).toHaveLength(1);
    expect(planted[0]).toMatchObject({ from: 'memory', to: 'engines', kind: 'static' });
  });

  // Self-test: DYNAMIC value edge fires even when nested inside a method body (guards V5 regressions).
  // The planted file sits at the real adapter's depth (engines/adapters/napi) so the
  // relative specifier resolves into `domains/inference`, exactly like the fixed V5 site.
  it('flags a planted dynamic cross-domain import nested in a method', () => {
    const planted = scanSource(
      `${DOMAINS_ROOT}/engines/adapters/napi/__planted_dyn__.ts`,
      `export class A {\n  async m() {\n    const { x } = await import('../../../inference/tensorzero-config.js');\n    return x;\n  }\n}\n`,
    );
    expect(planted).toHaveLength(1);
    expect(planted[0]).toMatchObject({ from: 'engines', to: 'inference', kind: 'dynamic' });
    expect(planted[0].line).toBe(3);
  });

  // Self-test: mixed `import { type A, b }` fires on the value specifier only.
  it('flags a mixed import on its value specifier', () => {
    const planted = scanSource(
      `${DOMAINS_ROOT}/memory/__planted_mixed__.ts`,
      `import { type Mem0Port, mem0Add } from '../engines/mem0-client.js';\nexport const y = mem0Add;\n`,
    );
    expect(planted).toHaveLength(1);
    expect(planted[0]).toMatchObject({ from: 'memory', to: 'engines', kind: 'static' });
  });

  // Self-test: namespace value import fires.
  it('flags a namespace cross-domain value import', () => {
    const planted = scanSource(
      `${DOMAINS_ROOT}/memory/__planted_ns__.ts`,
      `import * as engines from '../engines/mem0-client.js';\nexport const z = engines;\n`,
    );
    expect(planted).toHaveLength(1);
    expect(planted[0]).toMatchObject({ from: 'memory', to: 'engines', kind: 'static' });
  });

  // Negative self-test: a fully type-only cross-domain import is NOT flagged.
  it('allows a planted type-only cross-domain import', () => {
    const ok = scanSource(
      `${DOMAINS_ROOT}/memory/__planted_type__.ts`,
      `import type { Mem0Port } from '../engines/types.js';\nexport type Y = Mem0Port;\n`,
    );
    expect(ok).toEqual([]);
  });

  // Negative self-test: `import { type X }` (all specifiers type) is NOT flagged.
  it('allows an all-type named cross-domain import', () => {
    const ok = scanSource(
      `${DOMAINS_ROOT}/memory/__planted_named_type__.ts`,
      `import { type Mem0Port, type Mem0Result } from '../engines/types.js';\nexport type Y = Mem0Port;\n`,
    );
    expect(ok).toEqual([]);
  });

  // Negative self-test: same-domain and shared/ specifiers are ignored (static + dynamic).
  it('ignores same-domain and shared imports', () => {
    const ok = scanSource(
      `${DOMAINS_ROOT}/memory/adapters/__planted_local__.ts`,
      `import { helper } from '../local.js';\n` +
        `import { logger } from '../../../shared/logger.js';\n` +
        `export async function f() { return import('./sibling.js'); }\n`,
    );
    expect(ok).toEqual([]);
  });

  // Negative self-test: a `.test.ts` importer is exempt even with a value edge.
  it('exempts test scaffolding importers', () => {
    const ok = scanSource(
      `${DOMAINS_ROOT}/memory/adapters/mem0.adapter.test.ts`,
      `import { mem0Add } from '../../engines/mem0-client.js';\nexport const x = mem0Add;\n`,
    );
    expect(ok).toEqual([]);
  });
});
